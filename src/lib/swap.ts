import { encodeAbiParameters, encodeFunctionData, formatUnits, parseAbi, parseUnits } from "viem"
import { CONTRACTS, publicClient, V3_FEE_TIERS, WETH } from "./chain"

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
  supported: boolean
}

export type Quote = {
  pool: Pool
  amountInWei: bigint
  amountOutWei: bigint
  /** Human-readable output, already scaled by the token's decimals. */
  amountOut: string
  decimals: number
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
 * Which protocol holds this token's deepest pool, per the market lookup.
 *
 * `quoteToken` gates support alongside the protocol label: we buy by sending
 * ETH, so a token whose deepest pool is paired against something other than
 * WETH cannot be routed in one hop no matter which protocol it is on. Omitting
 * this check offered a swap panel on tokens that could never quote, which
 * degraded into "no pool answered" — technically true, and misleading, since
 * the pool was fine and the pairing was the problem.
 */
export function poolFromLabels(dexId?: string, labels?: string[], quoteToken?: string): Pool {
  const l = (labels || []).map((s) => s.toLowerCase())
  if (dexId === "flapsh") return { protocol: "flapsh", supported: false }
  if (l.includes("v4")) return { protocol: "v4", supported: false }
  if (l.includes("v2")) return { protocol: "unknown", supported: false }
  if (!l.includes("v3")) return { protocol: "unknown", supported: false }

  const pairedWithEth = !quoteToken || quoteToken.toLowerCase() === WETH.toLowerCase()
  return { protocol: "v3", supported: pairedWithEth }
}

async function quoteRaw(tokenOut: string, amountInWei: bigint, fee: number): Promise<bigint | null> {
  try {
    const { result } = await publicClient.simulateContract({
      address: CONTRACTS.quoterV2,
      abi: QUOTER_V2_ABI,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: WETH as `0x${string}`,
          tokenOut: tokenOut as `0x${string}`,
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

/**
 * A quote for buying `token` with `ethAmount` of native ETH.
 * `slippagePct` is a percentage (1 = 1%), applied to produce `minOutWei`.
 */
export async function quoteBuy(
  token: string,
  ethAmount: string,
  slippagePct: number,
  known?: { fee?: number; decimals?: number }
): Promise<Quote | null> {
  const amountInWei = parseUnits(ethAmount || "0", 18)
  if (amountInWei <= 0n) return null

  /* Re-pick the tier at this size on every quote rather than trusting the one
     discovered at page load. Depth shifts between blocks on pools this small,
     and the tier that was best for 0.01 ETH is not always best for 0.5. */
  const best = await bestFeeTier(token, amountInWei)
  if (!best) return null
  const fee = best.fee
  const out = best.amountOut

  const [refOut, decimals] = await Promise.all([
    quoteRaw(token, REFERENCE_WEI, fee),
    known?.decimals !== undefined ? Promise.resolve(known.decimals) : getDecimals(token),
  ])

  /* Impact from the marginal rate at dust size against the average rate at the
     requested size. Both legs are the same pool and the same tier, so the only
     variable is depth — which is the thing being measured. */
  let priceImpact = 0
  if (refOut && refOut > 0n) {
    const refRate = Number(refOut) / Number(REFERENCE_WEI)
    const rate = Number(out) / Number(amountInWei)
    priceImpact = refRate > 0 ? Math.max(0, (refRate - rate) / refRate) : 0
  }

  // Floor at 0.1% so a fat-fingered zero cannot produce a zero-protection swap.
  const bps = BigInt(Math.round(Math.max(0.1, slippagePct) * 100))
  const minOutWei = (out * (10000n - bps)) / 10000n

  return {
    pool: { protocol: "v3", fee, supported: true },
    amountInWei,
    amountOutWei: out,
    amountOut: formatUnits(out, decimals),
    decimals,
    priceImpact,
    minOutWei,
    minOut: formatUnits(minOutWei, decimals),
  }
}

/* ── Transaction building ───────────────────────────────────────────────
 *
 * Universal Router, two commands: WRAP_ETH (0x0b) then V3_SWAP_EXACT_IN (0x00).
 * ETH arrives as msg.value, WRAP_ETH turns it into WETH held by the router, and
 * the swap spends the router's balance — so a buy needs no token approval and no
 * Permit2 signature, removing the largest source of user error and of stuck
 * funds in a first swap implementation. Selling does need Permit2 and is
 * deliberately not built yet.
 *
 * The v3 path is packed: tokenIn (20) | fee (3) | tokenOut (20).
 *
 * THE INPUT LAYOUT IS NOT THE ONE IN UNISWAP'S DOCS. This deployment's
 * V3_SWAP_EXACT_IN takes a SIXTH parameter — a trailing `bytes`, empty in every
 * successful swap observed on-chain. Encoding the documented five reverts with
 * SliceOutOfBounds() because the router reads a path offset that isn't there.
 * The six-parameter encoding below reproduces a real successful mainnet swap
 * (tx 0xcc2157c2…d3832) byte for byte; `tools/audit/swap.mjs` asserts that
 * equality so a future edit cannot quietly regress it. */
const CMD_WRAP_ETH_THEN_V3_IN = "0x0b00"
/** UniversalRouter's magic recipient meaning "the router itself". */
const ADDRESS_THIS = "0x0000000000000000000000000000000000000002"
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
