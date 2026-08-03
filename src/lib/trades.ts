import { useEffect, useRef, useState } from "react"
import { parseAbi, parseAbiItem } from "viem"
import { CONTRACTS, publicClient, WETH } from "./chain"
import { NATIVE, poolIdOf, type V4Key } from "./v4"

/* Recent trades, read from the pool itself.
 *
 * Not our own indexer — the pool's own Swap events, which are the record every
 * other tool is also reading. DexScreener publishes no endpoint for individual
 * fills, so the choice was their iframe or the chain, and the chain is both the
 * primary source and the one we can render in our own type.
 *
 * TWO PROTOCOLS, OPPOSITE SIGN CONVENTIONS. A v3 pool emits amounts from ITS
 * perspective — positive means "into the pool", so ETH in is a buy. The v4
 * PoolManager emits them from the SWAPPER's perspective — negative means "paid",
 * so ETH in is NEGATIVE. Verified against real transactions in both cases by
 * comparing the sign against the transaction's own ETH value. Getting this
 * backwards silently labels every buy a sell, which no error would surface.
 *
 * THE NODE ERRORS ABOVE 10,000 LOGS RATHER THAN TRUNCATING. An earlier version
 * of this file queried a fixed 50,000-block window on the belief that the RPC
 * capped results and kept the newest; it does not — it rejects the query
 * outright. That window was survivable only because the pools tested were young
 * enough to have fewer than 10,000 fills in it. A pool with steady volume
 * crosses that within a few hours and the whole tape would have failed with
 * "connection lost". So: start narrow, widen only while short of rows, and stop
 * at the first window that either satisfies us or refuses. */

const V3_SWAP = parseAbiItem(
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
)

const V4_SWAP = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"
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

/** Where to read fills from. v3 has a pool contract; v4 has only an id. */
export type TradeSource =
  | { kind: "v3"; pool: string }
  | { kind: "v4"; poolId: string; ethIsCurrency0: boolean }

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

/** Build a v4 source from a resolved pool key. */
export function v4Source(key: V4Key): TradeSource {
  return {
    kind: "v4",
    poolId: poolIdOf(key),
    ethIsCurrency0:
      key.currency0.toLowerCase() === NATIVE || key.currency0.toLowerCase() === WETH.toLowerCase(),
  }
}

/** txHash → the EOA that signed it. Survives polls; a fill never changes hands. */
const senderCache = new Map<string, string>()

/* Blocks are ~100ms. 1,500 covers roughly two and a half minutes, which fills
   the table for anything actively traded; the wider steps exist for quiet pools
   and stop well short of where the node starts refusing. */
const SPANS = [1_500n, 12_000n, 60_000n]

/** A fill, flattened out of whichever event shape produced it. */
type RawFill = { amount0: bigint; amount1: bigint; txHash: string; blockNumber: bigint }

async function readLogs(source: TradeSource, tip: bigint, limit: number): Promise<RawFill[]> {
  let best: RawFill[] = []
  for (const span of SPANS) {
    const fromBlock = tip > span ? tip - span : 0n
    try {
      const fills: RawFill[] =
        source.kind === "v3"
          ? (
              await publicClient.getLogs({
                address: source.pool as `0x${string}`,
                event: V3_SWAP,
                fromBlock,
                toBlock: tip,
              })
            ).map((l) => ({
              amount0: l.args.amount0 ?? 0n,
              amount1: l.args.amount1 ?? 0n,
              txHash: l.transactionHash ?? "",
              blockNumber: l.blockNumber ?? 0n,
            }))
          : (
              await publicClient.getLogs({
                address: CONTRACTS.v4PoolManager as `0x${string}`,
                event: V4_SWAP,
                args: { id: source.poolId as `0x${string}` },
                fromBlock,
                toBlock: tip,
              })
            ).map((l) => ({
              amount0: l.args.amount0 ?? 0n,
              amount1: l.args.amount1 ?? 0n,
              txHash: l.transactionHash ?? "",
              blockNumber: l.blockNumber ?? 0n,
            }))

      best = fills
      if (fills.length >= limit) break
    } catch {
      /* Too many logs in this window, or the node declined it. Whatever the
         narrower window already returned is still correct and still recent. */
      break
    }
  }
  return best
}

export async function fetchTrades(source: TradeSource, limit = 30): Promise<Trade[]> {
  const tip = await publicClient.getBlockNumber()

  /* For v3 the pool decides which side ETH is on; for v4 the key already told
     us. Both answer the same question: which amount is the ETH leg. */
  let ethIsFirst: boolean
  if (source.kind === "v3") {
    const token0 = (await publicClient.readContract({
      address: source.pool as `0x${string}`,
      abi: POOL_ABI,
      functionName: "token0",
    })) as string
    ethIsFirst = token0.toLowerCase() === WETH.toLowerCase()
  } else {
    ethIsFirst = source.ethIsCurrency0
  }

  const logs = await readLogs(source, tip, limit)
  const recent = logs.slice(-limit).reverse()
  if (!recent.length) return []

  /* One timestamp read per distinct block, not per trade — a busy pool puts
     dozens of fills in the same block and this is a public RPC. */
  const blocks = [...new Set(recent.map((f) => f.blockNumber))]
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

  /* Resolve who actually traded. Neither event names them: v3's `recipient` is
     the router whenever the output is WETH being unwrapped, and v4's `sender` is
     always the router. The transaction's `from` is the EOA that signed it.
     Cached by hash so a 12-second poll re-reads only genuinely new fills. */
  await Promise.all(
    [...new Set(recent.map((f) => f.txHash).filter(Boolean))]
      .filter((h) => !senderCache.has(h))
      .map(async (h) => {
        try {
          const tx = await publicClient.getTransaction({ hash: h as `0x${string}` })
          senderCache.set(h, tx.from)
        } catch {
          /* leave unresolved; the row shows a dash rather than a wrong address */
        }
      })
  )

  const now = BigInt(Math.floor(Date.now() / 1000))
  const abs = (v: bigint) => (v < 0n ? -v : v)

  return recent.map((fill) => {
    const ethDelta = ethIsFirst ? fill.amount0 : fill.amount1
    const tokenDelta = ethIsFirst ? fill.amount1 : fill.amount0
    const ts = times.get(fill.blockNumber)

    /* v3: positive means into the pool, so ETH in (positive) is a buy.
       v4: negative means the swapper paid it, so ETH leaving them (negative)
       is a buy. Same event name, inverted meaning. */
    const isBuy = source.kind === "v3" ? ethDelta > 0n : ethDelta < 0n

    return {
      kind: isBuy ? ("buy" as const) : ("sell" as const),
      ethWei: abs(ethDelta),
      tokenWei: abs(tokenDelta),
      trader: senderCache.get(fill.txHash) || "",
      txHash: fill.txHash,
      blockNumber: fill.blockNumber,
      ageSeconds: ts !== undefined ? Math.max(0, Number(now - ts)) : null,
    }
  })
}

export type TradesResult = { trades: Trade[]; ok: boolean }

/** Poll a pool's fills. Returns null while the first read is in flight. */
export function useTrades(source: TradeSource | null, everyMs = 12_000): TradesResult | null {
  const [state, setState] = useState<TradesResult | null>(null)
  const alive = useRef(true)
  const key = source ? (source.kind === "v3" ? source.pool : source.poolId) : ""

  useEffect(() => {
    alive.current = true
    if (!source) {
      setState({ trades: [], ok: true })
      return
    }
    setState(null)

    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const trades = await fetchTrades(source)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, everyMs])

  return state
}
