import { encodeAbiParameters, encodeFunctionData, formatUnits, parseAbi, parseUnits } from "viem"
import { CONTRACTS, publicClient, V3_FEE_TIERS, WETH } from "./chain"
import {
  buildV4Swap,
  buyIsZeroForOne,
  buyPaysNative,
  findV4Key,
  NATIVE,
  quoteV4,
  v4Liquidity,
  type V4Key,
} from "./v4"

/* Quoting and transaction building for in-app swaps.
 *
 * The swap executes against Uniswap's own deployed contracts, from the user's
 * own wallet. NewEra deploys nothing, holds nothing, and never takes custody —
 * which is also why none of this needs a contract audit: there is no contract
 * of ours to audit. What there is instead is this file, where an off-by-one in
 * a minimum-output calculation costs somebody real money, so every value that
 * protects the user is computed here and asserted before a transaction is ever
 * offered for signing.
 *
 * COVERAGE. Measured over the last 100 launches, of 76 tokens with a market:
 * 28 are Uniswap v4, 23 v3, 1 v2, and 24 are on flapsh. This module routes v3
 * today and reports everything else as unsupported so the caller falls back to
 * the external handoff — a wrong route is worse than an honest one. */

export const QUOTER_V2_ABI = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
])

export const ERC20_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
])

export type Protocol = "v3" | "v4" | "flapsh" | "unknown"

export type Pool = {
  protocol: Protocol
  /** v3 fee tier in hundredths of a bip. Undefined for other protocols. */
  fee?: number
  /** v4 pool key, recovered from the poolId. Undefined for other protocols. */
  key?: V4Key
  supported: boolean
  /** Why it is not supported, when it is not. Shown to the user verbatim. */
  reason?: string
}

/** Which way the trade goes. Selling needs approvals; buying never does. */
export type Side = "buy" | "sell"

export type Quote = {
  pool: Pool
  side: Side
  amountInWei: bigint
  amountOutWei: bigint
  /** Human-readable output, already scaled by the OUTPUT token's decimals. */
  amountOut: string
  /** Decimals of the token being received. */
  outDecimals: number
  /** Decimals of the token being spent. */
  inDecimals: number
  /** Fraction lost versus a tiny reference trade in the SAME pool, 0–1. */
  priceImpact: number
  /** What the user is guaranteed at the chosen slippage. */
  minOutWei: bigint
  minOut: string
}

/* Price impact is measured against a near-dust trade in the same pool, never
   against a third party's spot price. Comparing a v3 quote to DexScreener's
   headline price compares two different pools and produces nonsense — it
   briefly showed a *negative* impact that got better with size, which is how
   the mistake was caught. */
const REFERENCE_WEI = 10n ** 12n // 0.000001 ETH

/**
 * Which protocol holds this token's market, per the market lookup. Cheap and
 * synchronous — it decides only whether a route is worth resolving on-chain.
 *
 * `quoteToken` gates v3 alongside the protocol label: a v3 buy pays in WETH, so
 * a token paired against something else cannot be routed in one hop. Omitting
 * that check offered a swap panel on tokens that could never quote, which
 * degraded into "no pool answered" — true, and misleading, since the pool was
 * fine and the pairing was the problem. v4 has no such restriction here: it
 * takes native ETH directly, and its pairing is checked when the key resolves.
 */
export function poolFromLabels(dexId?: string, labels?: string[], quoteToken?: string): Pool {
  const l = (labels || []).map((s) => s.toLowerCase())
  if (dexId === "flapsh") {
    return { protocol: "flapsh", supported: false, reason: "This market is on flapsh, which NewEra does not route." }
  }
  if (l.includes("v4")) return { protocol: "v4", supported: true }
  if (l.includes("v2")) {
    return { protocol: "unknown", supported: false, reason: "This market is on Uniswap v2, which NewEra does not route." }
  }
  if (!l.includes("v3")) {
    return { protocol: "unknown", supported: false, reason: "We could not identify which venue holds this market." }
  }

  const eth = !quoteToken || quoteToken.toLowerCase() === WETH.toLowerCase()
  return eth
    ? { protocol: "v3", supported: true }
    : { protocol: "v3", supported: false, reason: "This pool is not paired against ETH, so it cannot be traded in one hop." }
}

/**
 * Turn a candidate protocol into a route that can actually be quoted, by asking
 * the chain for the part the market lookup cannot supply — a v3 fee tier, or a
 * v4 pool key. Returns a Pool with `supported: false` and a plain-English
 * `reason` when the market exists but we cannot reach it.
 */
export async function resolveRoute(
  token: string,
  candidate: Pool,
  poolId?: string
): Promise<Pool> {
  if (!candidate.supported) return candidate

  if (candidate.protocol === "v3") {
    const fee = await findFeeTier(token)
    if (fee === null) {
      return { protocol: "v3", supported: false, reason: "No v3 pool answered a quote for this token." }
    }
    return { protocol: "v3", fee, supported: true }
  }

  if (candidate.protocol === "v4") {
    if (!poolId) {
      return { protocol: "v4", supported: false, reason: "We could not identify this v4 pool." }
    }
    const key = await findV4Key(token, poolId)
    if (!key) {
      /* Either the pool uses a hook and was created before the node's log
         history begins, or its key is non-standard. Guessing at a key would
         route funds into the wrong pool, so we decline instead. */
      return {
        protocol: "v4",
        supported: false,
        reason: "This v4 pool's configuration could not be read from the chain, so we will not guess at a route.",
      }
    }
    /* Ask the quoter, not the liquidity reading.
       `getLiquidity` reports depth AT THE CURRENT TICK, and zero there does not
       mean untradeable — a swap simply crosses into whatever tick holds the next
       position. Gating on it declined a pool that had been quoted and executed
       successfully minutes earlier. The quoter walks the ticks and is the only
       authority on whether a trade can actually fill; liquidity is kept solely
       to tell a drained pool apart from one that is merely too thin right now. */
    const buyZfo = buyIsZeroForOne(key, token)
    const probe = await quoteV4(key, REFERENCE_WEI, buyZfo)
    if (probe === null) {
      const liquidity = await v4Liquidity(key)
      return {
        protocol: "v4",
        key,
        supported: false,
        reason:
          liquidity === 0n
            ? "This pool has a price but nothing behind it — whoever supplied its liquidity has withdrawn, so nothing can be traded at any size."
            : "This pool would not quote even a dust trade, so it cannot be traded right now.",
      }
    }
    return { protocol: "v4", key, supported: true }
  }

  return candidate
}

async function quoteRaw(
  tokenOut: string,
  amountInWei: bigint,
  fee: number,
  reversed = false
): Promise<bigint | null> {
  try {
    const { result } = await publicClient.simulateContract({
      address: CONTRACTS.quoterV2,
      abi: QUOTER_V2_ABI,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: (reversed ? tokenOut : WETH) as `0x${string}`,
          tokenOut: (reversed ? WETH : tokenOut) as `0x${string}`,
          amountIn: amountInWei,
          fee,
          sqrtPriceLimitX96: 0n,
        },
      ],
    })
    return (result as readonly bigint[])[0] ?? null
  } catch {
    // No pool at this tier, or not enough liquidity to fill. Both are "no".
    return null
  }
}

/**
 * The v3 fee tier that gives the most tokens back for `amountInWei`, or null if
 * no tier holds this pair.
 *
 * Not "the first tier that answers". A token can have pools at several tiers,
 * and the cheapest tier is routinely the emptiest one — taking the first hit
 * would quietly route a real trade through a near-empty pool and cost the user
 * the difference. Probing costs four parallel eth_calls and is worth it.
 *
 * The tiers are compared at the ACTUAL trade size, because depth is what
 * separates them: a tier that looks best for dust can be far worse at size.
 */
export async function bestFeeTier(
  tokenOut: string,
  amountInWei: bigint
): Promise<{ fee: number; amountOut: bigint } | null> {
  const quotes = await Promise.all(
    V3_FEE_TIERS.map(async (fee) => ({ fee, out: await quoteRaw(tokenOut, amountInWei, fee) }))
  )
  let best: { fee: number; amountOut: bigint } | null = null
  for (const q of quotes) {
    if (q.out && q.out > 0n && (!best || q.out > best.amountOut)) best = { fee: q.fee, amountOut: q.out }
  }
  return best
}

/** The deepest tier holding this pair, measured at a reference size. */
export async function findFeeTier(tokenOut: string): Promise<number | null> {
  const best = await bestFeeTier(tokenOut, REFERENCE_WEI)
  return best?.fee ?? null
}

export async function getDecimals(token: string): Promise<number> {
  try {
    const d = await publicClient.readContract({
      address: token as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "decimals",
    })
    return Number(d)
  } catch {
    return 18
  }
}

/** Raw output for a given route, size and direction. Null means "cannot fill". */
async function routeQuote(
  pool: Pool,
  token: string,
  amountInWei: bigint,
  side: Side
): Promise<{ out: bigint; fee?: number } | null> {
  if (pool.protocol === "v4") {
    if (!pool.key) return null
    /* zeroForOne describes currency order, not intent: buying moves currency0
       into currency1 when the token IS currency1, and selling is the reverse. */
    const buyZfo = buyIsZeroForOne(pool.key, token)
    const out = await quoteV4(pool.key, amountInWei, side === "buy" ? buyZfo : !buyZfo)
    return out === null ? null : { out }
  }

  if (side === "sell") {
    if (pool.fee === undefined) return null
    const out = await quoteRaw(token, amountInWei, pool.fee, true)
    return out && out > 0n ? { out, fee: pool.fee } : null
  }

  /* Re-pick the v3 tier at this size on every quote rather than trusting the one
     found at page load. Depth shifts between blocks on pools this small, and the
     tier that was best for 0.01 ETH is not always best for 0.5. */
  const best = await bestFeeTier(token, amountInWei)
  return best ? { out: best.amountOut, fee: best.fee } : null
}

/**
 * Quote a trade in either direction.
 *
 * `amount` is what the user types: ETH when buying, tokens when selling.
 * `slippagePct` is a percentage (1 = 1%) and produces `minOutWei`, which is the
 * only number here the chain will actually enforce.
 */
export async function quoteTrade(params: {
  pool: Pool
  token: string
  amount: string
  side: Side
  slippagePct: number
  tokenDecimals?: number
}): Promise<Quote | null> {
  const { pool, token, amount, side, slippagePct } = params
  if (!pool.supported) return null

  const tokenDecimals =
    params.tokenDecimals !== undefined ? params.tokenDecimals : await getDecimals(token)
  const inDecimals = side === "buy" ? 18 : tokenDecimals
  const outDecimals = side === "buy" ? tokenDecimals : 18

  let amountInWei: bigint
  try {
    amountInWei = parseUnits(amount || "0", inDecimals)
  } catch {
    return null
  }
  if (amountInWei <= 0n) return null

  const quoted = await routeQuote(pool, token, amountInWei, side)
  if (!quoted || quoted.out <= 0n) return null
  const out = quoted.out
  const fee = quoted.fee ?? pool.fee

  /* Impact is the marginal rate at dust size against the average rate at the
     requested size — same pool, same direction, so the only variable is depth,
     which is the thing being measured. Never compared against a third party's
     spot price: that compares two different pools and once produced a NEGATIVE
     impact that improved with size, which is how the mistake was caught.

     The reference is scaled to the input token so a sell quote is not measured
     against a millionth of an ETH's worth of a token with 18 decimals. */
  const referenceWei =
    side === "buy" ? REFERENCE_WEI : amountInWei / 1000n > 0n ? amountInWei / 1000n : 1n
  const refPool: Pool = fee !== undefined ? { ...pool, fee } : pool
  const ref = await routeQuote(refPool, token, referenceWei, side)

  let priceImpact = 0
  if (ref && ref.out > 0n) {
    const refRate = Number(ref.out) / Number(referenceWei)
    const rate = Number(out) / Number(amountInWei)
    priceImpact = refRate > 0 ? Math.max(0, (refRate - rate) / refRate) : 0
  }

  // Floor at 0.1% so a fat-fingered zero cannot produce a zero-protection swap.
  const bps = BigInt(Math.round(Math.max(0.1, slippagePct) * 100))
  const minOutWei = (out * (10000n - bps)) / 10000n

  return {
    pool: refPool,
    side,
    amountInWei,
    amountOutWei: out,
    amountOut: formatUnits(out, outDecimals),
    outDecimals,
    inDecimals,
    priceImpact,
    minOutWei,
    minOut: formatUnits(minOutWei, outDecimals),
  }
}

/* ── Transaction building ───────────────────────────────────────────────
 *
 * Buying on v3: WRAP_ETH (0x0b) then V3_SWAP_EXACT_IN (0x00). ETH arrives as
 * msg.value, WRAP_ETH turns it into WETH held by the router, and the swap spends
 * the router's own balance — so a buy needs no approval of any kind.
 *
 * Selling on v3: V3_SWAP_EXACT_IN (0x00) then UNWRAP_WETH (0x0c). The router
 * pulls the token from the user through Permit2 (payerIsUser = true), swaps it
 * to WETH held by the router, then unwraps and forwards plain ETH to the user.
 * Both legs carry the minimum so neither can be skipped past.
 *
 * The v3 path is packed: tokenIn (20) | fee (3) | tokenOut (20), and it is
 * reversed for a sell — the path always runs from what you pay to what you get.
 *
 * THE INPUT LAYOUT IS NOT THE ONE IN UNISWAP'S DOCS. This deployment's
 * V3_SWAP_EXACT_IN takes a SIXTH parameter — a trailing `bytes`, empty in every
 * successful swap observed on-chain. Encoding the documented five reverts with
 * SliceOutOfBounds() because the router reads a path offset that isn't there.
 * The six-parameter encoding below reproduces a real successful mainnet swap
 * (tx 0xcc2157c2…d3832) byte for byte; `tools/audit/swap.mjs` asserts that
 * equality so a future edit cannot quietly regress it. */
const CMD_WRAP_ETH_THEN_V3_IN = "0x0b00"
const CMD_V3_IN_THEN_UNWRAP = "0x000c"
/** UniversalRouter's magic recipients: the router itself, and whoever called. */
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002"
const MSG_SENDER = "0x0000000000000000000000000000000000000001"
const ROUTER_ABI = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
])

const V3_SWAP_IN_PARAMS = [
  { type: "address" }, // recipient
  { type: "uint256" }, // amountIn
  { type: "uint256" }, // amountOutMinimum
  { type: "bytes" }, // path
  { type: "bool" }, // payerIsUser
  { type: "bytes" }, // see note above — always empty
] as const

/** Thrown by the router when the swap would return less than amountOutMinimum. */
export const V3_TOO_LITTLE_RECEIVED = "0x39d35496"

function encodePath(tokenIn: string, fee: number, tokenOut: string): `0x${string}` {
  const hex = (s: string) => s.toLowerCase().replace(/^0x/, "")
  return `0x${hex(tokenIn)}${fee.toString(16).padStart(6, "0")}${hex(tokenOut)}` as `0x${string}`
}

export type BuiltSwap = {
  to: `0x${string}`
  data: `0x${string}`
  value: bigint
  deadline: bigint
}

/**
 * Build the buy. `recipient` receives the tokens — always the connected wallet,
 * never an address of ours.
 */
export function buildBuy(params: {
  token: string
  recipient: string
  amountInWei: bigint
  minOutWei: bigint
  fee: number
  deadlineSeconds?: number
}): BuiltSwap {
  const { token, recipient, amountInWei, minOutWei, fee } = params
  if (minOutWei <= 0n) throw new Error("refusing to build a swap with no minimum output")
  if (amountInWei <= 0n) throw new Error("refusing to build a swap with no input")

  const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSeconds ?? 900))

  // WRAP_ETH(ADDRESS_THIS, amountIn) — without this the router holds raw ETH
  // and the v3 pool, which only knows about WETH, reverts.
  const wrapInput = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [ADDRESS_THIS as `0x${string}`, amountInWei]
  )

  /* payerIsUser = false: the router already holds the wrapped ETH, so funds come
     from its own balance rather than being pulled from the user through Permit2.
     recipient is the user's wallet — the tokens never touch an address of ours. */
  const swapInput = encodeAbiParameters(V3_SWAP_IN_PARAMS, [
    recipient as `0x${string}`,
    amountInWei,
    minOutWei,
    encodePath(WETH, fee, token),
    false,
    "0x",
  ])

  return {
    to: CONTRACTS.universalRouter as `0x${string}`,
    data: encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "execute",
      args: [CMD_WRAP_ETH_THEN_V3_IN, [wrapInput, swapInput], deadline],
    }),
    value: amountInWei,
    deadline,
  }
}

/**
 * Build a v3 sell: token in, plain ETH out.
 *
 * The swap output goes to the router (ADDRESS_THIS) rather than the user,
 * because what comes out of a v3 pool is WETH and almost nobody wants WETH.
 * UNWRAP_WETH then converts the router's balance and forwards ETH to the caller.
 * Requires a Permit2 grant — see permit2.ts — since payerIsUser pulls the token
 * from the user's wallet.
 */
export function buildSell(params: {
  token: string
  amountInWei: bigint
  minOutWei: bigint
  fee: number
  deadlineSeconds?: number
}): BuiltSwap {
  const { token, amountInWei, minOutWei, fee } = params
  if (minOutWei <= 0n) throw new Error("refusing to build a sell with no minimum output")
  if (amountInWei <= 0n) throw new Error("refusing to build a sell with no input")

  const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSeconds ?? 900))

  const swapInput = encodeAbiParameters(V3_SWAP_IN_PARAMS, [
    ADDRESS_THIS as `0x${string}`,
    amountInWei,
    minOutWei,
    encodePath(token, fee, WETH),
    true, // payerIsUser — pulled from the wallet via Permit2
    "0x",
  ])

  /* The minimum is repeated here deliberately. The swap leg already enforces it,
     but UNWRAP_WETH carries its own floor, and leaving that at zero would let a
     swap that somehow produced less still forward whatever it produced. */
  const unwrapInput = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [MSG_SENDER as `0x${string}`, minOutWei]
  )

  return {
    to: CONTRACTS.universalRouter as `0x${string}`,
    data: encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "execute",
      args: [CMD_V3_IN_THEN_UNWRAP, [swapInput, unwrapInput], deadline],
    }),
    value: 0n,
    deadline,
  }
}

/**
 * Build a trade on whichever protocol the route names. The single entry point
 * the UI uses, so a caller cannot accidentally send a v4 pool down the v3 path.
 */
export function buildTrade(params: {
  pool: Pool
  token: string
  recipient: string
  quote: Quote
  deadlineSeconds?: number
}): BuiltSwap {
  const { pool, token, recipient, quote, deadlineSeconds } = params

  if (pool.protocol === "v4") {
    if (!pool.key) throw new Error("no v4 pool key on this route — refusing to send")
    const buyZfo = buyIsZeroForOne(pool.key, token)
    const zeroForOne = quote.side === "buy" ? buyZfo : !buyZfo
    const payingCurrency = zeroForOne ? pool.key.currency0 : pool.key.currency1
    return buildV4Swap({
      key: pool.key,
      zeroForOne,
      amountInWei: quote.amountInWei,
      minOutWei: quote.minOutWei,
      nativeIn: payingCurrency.toLowerCase() === NATIVE,
      deadlineSeconds,
    })
  }

  if (pool.fee === undefined) throw new Error("no v3 fee tier on this route — refusing to send")
  return quote.side === "buy"
    ? buildBuy({ token, recipient, amountInWei: quote.amountInWei, minOutWei: quote.minOutWei, fee: pool.fee, deadlineSeconds })
    : buildSell({ token, amountInWei: quote.amountInWei, minOutWei: quote.minOutWei, fee: pool.fee, deadlineSeconds })
}

/** Whether this trade needs Permit2 grants before it can be sent. */
export const needsApproval = (pool: Pool, token: string, side: Side): boolean => {
  if (side === "buy") {
    // A v4 buy paid in WETH rather than native ETH still pulls an ERC-20.
    return pool.protocol === "v4" && !!pool.key && !buyPaysNative(pool.key, token)
  }
  return true
}
