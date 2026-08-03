import { useEffect, useRef, useState } from "react"
import { parseAbi, parseAbiItem } from "viem"
import { CONTRACTS, publicClient, WETH } from "./chain"

/* Recent trades, read from the pool itself.
 *
 * Not our own indexer — the pool's own Swap events, which are the record every
 * other tool is also reading. DexScreener has no public endpoint for individual
 * fills, so the choice was their iframe or the chain, and the chain is both the
 * primary source and the one we can render in our own type.
 *
 * The RPC caps a getLogs response at roughly 1,700 entries and truncates from
 * the OLD end, keeping the newest — verified against a live pool, where a
 * 50,000-block query returned logs ending 12 blocks behind the tip. So a wide
 * span is safe and returns recent history; it is the far past that is
 * unreachable, which is the half nobody is looking at. */

const SWAP_EVENT = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
)

const FACTORY_ABI = parseAbi(["function getPool(address,address,uint24) view returns (address)"])
const POOL_ABI = parseAbi(["function token0() view returns (address)"])

export type Trade = {
  kind: "buy" | "sell"
  /** ETH moved, absolute, in wei. */
  ethWei: bigint
  /** Tokens moved, absolute, in base units. */
  tokenWei: bigint
  trader: string
  txHash: string
  blockNumber: bigint
  /** Seconds before now. Null until the block timestamp is resolved. */
  ageSeconds: number | null
}

export async function getPoolAddress(token: string, fee: number): Promise<string | null> {
  try {
    const pool = (await publicClient.readContract({
      address: CONTRACTS.v3Factory as `0x${string}`,
      abi: FACTORY_ABI,
      functionName: "getPool",
      args: [WETH as `0x${string}`, token as `0x${string}`, fee],
    })) as string
    return /^0x0{40}$/i.test(pool) ? null : pool
  } catch {
    return null
  }
}

/* ~8 minutes of history at this chain's 100ms blocks. Wide enough that a quiet
   token still shows something, short enough that the RPC answers quickly. */
const SPAN = 50_000n

/** txHash → the EOA that signed it. Survives polls; a fill never changes hands. */
const senderCache = new Map<string, string>()

export async function fetchTrades(pool: string, limit = 30): Promise<Trade[]> {
  const [tip, token0] = await Promise.all([
    publicClient.getBlockNumber(),
    publicClient.readContract({ address: pool as `0x${string}`, abi: POOL_ABI, functionName: "token0" }) as Promise<string>,
  ])
  const wethIsToken0 = token0.toLowerCase() === WETH.toLowerCase()

  const logs = await publicClient.getLogs({
    address: pool as `0x${string}`,
    event: SWAP_EVENT,
    fromBlock: tip > SPAN ? tip - SPAN : 0n,
    toBlock: tip,
  })

  const recent = logs.slice(-limit).reverse()

  /* One timestamp read per distinct block, not per trade — a busy pool puts
     dozens of fills in the same block and this is a public RPC. */
  const blocks = [...new Set(recent.map((l) => l.blockNumber))]
  const times = new Map<bigint, bigint>()
  await Promise.all(
    blocks.map(async (b) => {
      try {
        const blk = await publicClient.getBlock({ blockNumber: b })
        times.set(b, blk.timestamp)
      } catch {
        /* leave unresolved; the row renders without an age */
      }
    })
  )

  /* Resolve who actually traded.
     The Swap event's `sender` is whatever contract called the pool — the router
     — and `recipient` is only the trader when the output goes straight to them.
     On a sell the output is WETH, which the router receives to unwrap, so
     `recipient` is the router too: the tape showed SwapRouter02's address in the
     Trader column on every sell. The transaction's `from` is the EOA that signed
     it, which is the honest answer. Cached by hash so a 12-second poll re-reads
     only genuinely new fills. */
  await Promise.all(
    [...new Set(recent.map((l) => l.transactionHash).filter(Boolean))]
      .filter((h) => !senderCache.has(h as string))
      .map(async (h) => {
        try {
          const tx = await publicClient.getTransaction({ hash: h as `0x${string}` })
          senderCache.set(h as string, tx.from)
        } catch {
          /* fall back to the event's own fields below */
        }
      })
  )

  const now = BigInt(Math.floor(Date.now() / 1000))

  return recent.map((log) => {
    const a0 = log.args.amount0 as bigint
    const a1 = log.args.amount1 as bigint
    const ethDelta = wethIsToken0 ? a0 : a1
    const tokenDelta = wethIsToken0 ? a1 : a0
    const ts = times.get(log.blockNumber)
    const abs = (v: bigint) => (v < 0n ? -v : v)

    return {
      /* Signs are from the pool's perspective: positive means "into the pool".
         ETH flowing in is somebody buying the token. */
      kind: ethDelta > 0n ? "buy" : "sell",
      ethWei: abs(ethDelta),
      tokenWei: abs(tokenDelta),
      trader:
        senderCache.get(log.transactionHash || "") ||
        (log.args.recipient as string) ||
        (log.args.sender as string) ||
        "",
      txHash: log.transactionHash || "",
      blockNumber: log.blockNumber,
      ageSeconds: ts !== undefined ? Math.max(0, Number(now - ts)) : null,
    }
  })
}

export type TradesResult = { trades: Trade[]; ok: boolean }

/** Poll a pool's fills. Returns null while the first read is in flight. */
export function useTrades(pool: string | null, everyMs = 12_000): TradesResult | null {
  const [state, setState] = useState<TradesResult | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    if (!pool) {
      setState({ trades: [], ok: true })
      return
    }
    setState(null)

    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const trades = await fetchTrades(pool)
        if (alive.current) setState({ trades, ok: true })
      } catch {
        /* Keep the rows already on screen — an RPC hiccup should not blank a
           table that was correct a moment ago. Only the freshness claim drops. */
        if (alive.current) setState((prev) => ({ trades: prev?.trades || [], ok: false }))
      }
      if (alive.current) timer = setTimeout(tick, everyMs)
    }
    tick()

    return () => {
      alive.current = false
      clearTimeout(timer)
    }
  }, [pool, everyMs])

  return state
}
