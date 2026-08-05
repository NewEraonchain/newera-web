import { encodeAbiParameters, encodeFunctionData, keccak256, parseAbi, parseAbiItem } from "viem"
import { CONTRACTS, publicClient, WETH } from "./chain"

/* Uniswap v4 routing.
 *
 * v4 has no per-pair contract. Every pool lives inside one PoolManager and is
 * addressed by a `poolId` — the keccak of its PoolKey — so there is no factory
 * to ask and nothing to look up. The key has to be recovered, and recovering it
 * is most of this file.
 *
 * THE ENCODING DOES NOT MATCH UNISWAP'S DOCS, in the same way v3's did not.
 * This deployment's `ExactInputSingleParams` still carries a
 * `uint160 sqrtPriceLimitX96` between `amountOutMinimum` and `hookData`, which
 * newer v4-periphery removed. The five-field form encodes one word short and the
 * router reads garbage. The six-field form below reproduces a real successful
 * mainnet v4 swap byte for byte (tx 0xf395a9b3…f55c), and replaying that
 * transaction's own calldata at its own block succeeds — which is how the layout
 * was confirmed rather than guessed.
 *
 * QUOTES COME FROM THE V4 QUOTER, not from arithmetic. An earlier version of
 * this file computed them from pool state, after the quoter appeared to be
 * broken — it reverted `NotEnoughLiquidity` on every pool tried. That reading
 * was wrong: those pools genuinely had zero liquidity at their current price
 * (launch liquidity, since pulled), and the quoter was telling the truth. On
 * pools that are actually alive it answers every time. The arithmetic was also
 * not good enough to keep as a fallback — it matches the quoter to the wei on
 * plain pools but drifts up to 1% on pools with hooks, because a hook can change
 * what the pool charges and no amount of pool state reveals that. */

/** Native ETH is the zero address in v4 — no wrapping step, unlike v3. */
export const NATIVE = "0x0000000000000000000000000000000000000000" as const

export type V4Key = {
  currency0: `0x${string}`
  currency1: `0x${string}`
  fee: number
  tickSpacing: number
  hooks: `0x${string}`
}

const POOL_KEY_TUPLE = {
  type: "tuple",
  components: [
    { name: "currency0", type: "address" },
    { name: "currency1", type: "address" },
    { name: "fee", type: "uint24" },
    { name: "tickSpacing", type: "int24" },
    { name: "hooks", type: "address" },
  ],
} as const

/** Six fields — see the note above about sqrtPriceLimitX96. */
const EXACT_IN_SINGLE = [
  {
    type: "tuple",
    components: [
      { name: "poolKey", ...POOL_KEY_TUPLE },
      { name: "zeroForOne", type: "bool" },
      { name: "amountIn", type: "uint128" },
      { name: "amountOutMinimum", type: "uint128" },
      { name: "sqrtPriceLimitX96", type: "uint160" },
      { name: "hookData", type: "bytes" },
    ],
  },
] as const

const CURRENCY_AMOUNT = [{ type: "address" }, { type: "uint256" }] as const

const STATE_VIEW_ABI = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128)",
])

const QUOTER_ABI = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)",
])

const ROUTER_ABI = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
])

const INITIALIZE_EVENT = parseAbiItem(
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)"
)

/* SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL — the sequence every successful v4
   swap observed on this chain uses. TAKE_ALL delivers to the caller, so the
   output lands in the user's wallet and never passes through us. */
const ACTIONS = "0x060c0f" as const
const CMD_V4_SWAP = "0x10" as const

export const poolIdOf = (key: V4Key): `0x${string}` =>
  keccak256(encodeAbiParameters([POOL_KEY_TUPLE], [key]))

/* Standard (fee, tickSpacing) pairings, tried first because matching them costs
   nothing — it is a hash, not a network call. Real pools on this chain also use
   fee=0 with a hook that sets the fee dynamically, and 0x800000 (the dynamic-fee
   flag), which is why the log lookup below exists. */
const COMBOS: Array<[number, number]> = [
  [10000, 200],
  [3000, 60],
  [2500, 60],
  [500, 10],
  [100, 1],
  [0, 1],
  [0, 200],
]

/** How far back Initialize events remain readable. ~28 hours at 100ms blocks. */
const LOG_SPAN = 1_000_000n

/**
 * Recover a pool's key from its id.
 *
 * DexScreener's `pairAddress` for a v4 pair IS the poolId, which gives us the
 * target to match against. Two routes, cheapest first:
 *
 *   1. Hash standard hookless candidates until one equals the id — no network.
 *   2. Ask the PoolManager for the pool's own Initialize event, which carries
 *      the full key including any hook. This is the only way to route a pool
 *      with a hook or a dynamic fee, and it is bounded by how far back the node
 *      keeps logs — pools older than that are reported unroutable rather than
 *      guessed at.
 */
export async function findV4Key(token: string, poolId: string): Promise<V4Key | null> {
  const t = token.toLowerCase()
  const target = poolId.toLowerCase()

  /* Reject malformed input here rather than letting the encoder throw. The token
     address arrives from a URL segment, so anything at all can be in it, and an
     exception thrown out of route resolution takes the whole page down. */
  if (!/^0x[0-9a-f]{40}$/.test(t) || !/^0x[0-9a-f]{64}$/.test(target)) return null

  for (const base of [NATIVE, WETH.toLowerCase()]) {
    const [c0, c1] = base < t ? [base, t] : [t, base]
    for (const [fee, tickSpacing] of COMBOS) {
      const key: V4Key = {
        currency0: c0 as `0x${string}`,
        currency1: c1 as `0x${string}`,
        fee,
        tickSpacing,
        hooks: NATIVE,
      }
      if (poolIdOf(key).toLowerCase() === target) return key
    }
  }

  try {
    const tip = await publicClient.getBlockNumber()
    const logs = await publicClient.getLogs({
      address: CONTRACTS.v4PoolManager as `0x${string}`,
      event: INITIALIZE_EVENT,
      args: { id: poolId as `0x${string}` },
      fromBlock: tip > LOG_SPAN ? tip - LOG_SPAN : 0n,
      toBlock: tip,
    })
    const a = logs[0]?.args
    if (!a) return null
    const key: V4Key = {
      currency0: a.currency0 as `0x${string}`,
      currency1: a.currency1 as `0x${string}`,
      fee: Number(a.fee),
      tickSpacing: Number(a.tickSpacing),
      hooks: a.hooks as `0x${string}`,
    }
    // Never trust a log blindly — the key must hash back to the id we asked for.
    return poolIdOf(key).toLowerCase() === target ? key : null
  } catch {
    return null
  }
}

/** In-range liquidity. Zero means the pool has a price but cannot be traded. */
export async function v4Liquidity(key: V4Key): Promise<bigint | null> {
  try {
    return (await publicClient.readContract({
      address: CONTRACTS.v4StateView as `0x${string}`,
      abi: STATE_VIEW_ABI,
      functionName: "getLiquidity",
      args: [poolIdOf(key)],
    })) as bigint
  } catch {
    return null
  }
}

/** True when buying `token` means swapping currency0 into currency1. */
export const buyIsZeroForOne = (key: V4Key, token: string): boolean =>
  key.currency1.toLowerCase() === token.toLowerCase()

/** Whether paying for a buy means sending native ETH rather than an ERC-20. */
export const buyPaysNative = (key: V4Key, token: string): boolean => {
  const paying = buyIsZeroForOne(key, token) ? key.currency0 : key.currency1
  return paying.toLowerCase() === NATIVE
}

/** A quote straight from the v4 quoter, or null if the pool cannot fill it. */
export async function quoteV4(
  key: V4Key,
  amountIn: bigint,
  zeroForOne: boolean
): Promise<bigint | null> {
  try {
    const { result } = await publicClient.simulateContract({
      address: CONTRACTS.v4Quoter as `0x${string}`,
      abi: QUOTER_ABI,
      functionName: "quoteExactInputSingle",
      args: [{ poolKey: key, zeroForOne, exactAmount: amountIn, hookData: "0x" }],
    })
    const out = (result as readonly bigint[])[0]
    return out > 0n ? out : null
  } catch {
    /* NotEnoughLiquidity, a reverting hook, or a pool that has been drained.
       All of them mean the same thing to a person: not tradeable at this size. */
    return null
  }
}

/**
 * Will this pool actually let us swap, as opposed to merely quote one?
 *
 * The quoter does not run the pool's hook. A hook runs arbitrary code on every
 * swap and launch hooks routinely gate who may trade, so a hooked pool can
 * return a clean quote and then revert the real swap with an error of its own
 * devising — observed live, selector 0xd81b2f2e from a hook at 0x4e3468…a544.
 * The only way to ask the hook is to run it, so this simulates a dust swap
 * against a funded phantom address. Costs one eth_call, and only hooked pools
 * pay it.
 */
export async function canSwapV4(key: V4Key, zeroForOne: boolean): Promise<boolean> {
  try {
    const amountIn = 10n ** 12n
    const tx = buildV4Swap({
      key,
      zeroForOne,
      amountInWei: amountIn,
      minOutWei: 1n,
      nativeIn: (zeroForOne ? key.currency0 : key.currency1).toLowerCase() === NATIVE,
    })
    await publicClient.call({
      account: PROBE_ACCOUNT,
      to: tx.to,
      data: tx.data,
      value: tx.value,
      // A balance the probe does not have, so the call tests the pool rather
      // than the emptiness of an address nobody owns.
      stateOverride: [{ address: PROBE_ACCOUNT, balance: 10n ** 18n }],
    })
    return true
  } catch {
    return false
  }
}

/** Not a real account. Only ever used as the sender of a simulated call. */
const PROBE_ACCOUNT = "0x1111111111111111111111111111111111111111" as const

export type BuiltV4 = { to: `0x${string}`; data: `0x${string}`; value: bigint; deadline: bigint }

function encodeSwap(key: V4Key, zeroForOne: boolean, amountIn: bigint, minOut: bigint) {
  const inCurrency = zeroForOne ? key.currency0 : key.currency1
  const outCurrency = zeroForOne ? key.currency1 : key.currency0
  return encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [
    ACTIONS,
    [
      encodeAbiParameters(EXACT_IN_SINGLE, [
        {
          poolKey: key as never,
          zeroForOne,
          amountIn,
          amountOutMinimum: minOut,
          sqrtPriceLimitX96: 0n,
          hookData: "0x",
        },
      ] as never),
      /* SETTLE_ALL: pay what the swap owes, capped at what the user agreed to.
         This was MAX_U256, described as "capped at everything provided" — which
         is not a cap, it is the absence of one. `minOutWei` floors the OUTPUT
         only; the input is whatever the PoolManager says is owed after the hook
         has run, and a v4 hook can add to that debt or take the input currency
         as its own fee. On a buy the input is bounded by msg.value, but on a
         SELL the input is an ERC-20 pulled through a MAX_UINT160 Permit2 grant,
         so the ceiling was the user's entire balance of that token — while they
         still received only minOut.

         Verified on a live hooked pool: a cap of `amountIn` succeeds, and
         `amountIn - 1` reverts 0x12bacdd3 (V4TooMuchRequested). The tight cap
         is enforced, costs nothing, and changes nothing on a well-behaved
         pool. */
      encodeAbiParameters(CURRENCY_AMOUNT, [inCurrency, amountIn]),
      // TAKE_ALL: collect the output, reverting below the minimum.
      encodeAbiParameters(CURRENCY_AMOUNT, [outCurrency, minOut]),
    ],
  ])
}

/**
 * Build a v4 swap. `nativeIn` is true when paying with ETH, which v4 accepts
 * directly as msg.value with no wrapping step. Paying with a token instead
 * requires a Permit2 grant to the router first — see permit2.ts.
 */
export function buildV4Swap(params: {
  key: V4Key
  zeroForOne: boolean
  amountInWei: bigint
  minOutWei: bigint
  nativeIn: boolean
  deadlineSeconds?: number
}): BuiltV4 {
  const { key, zeroForOne, amountInWei, minOutWei, nativeIn } = params
  if (minOutWei <= 0n) throw new Error("refusing to build a v4 swap with no minimum output")
  if (amountInWei <= 0n) throw new Error("refusing to build a v4 swap with no input")

  const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineSeconds ?? 900))
  return {
    to: CONTRACTS.universalRouter as `0x${string}`,
    data: encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "execute",
      args: [CMD_V4_SWAP, [encodeSwap(key, zeroForOne, amountInWei, minOutWei)], deadline],
    }),
    value: nativeIn ? amountInWei : 0n,
    deadline,
  }
}
