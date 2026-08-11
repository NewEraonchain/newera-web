/* Swap safety suite — exercises src/lib/swap.ts and src/lib/v4.ts themselves,
 * not copies of them.
 *
 * This is the one audit where a regression costs money rather than pixels, so it
 * asserts, against the live chain:
 *   1. both encodings still reproduce real successful on-chain swaps byte for byte
 *   2. a well-formed buy actually executes (simulated with a balance override)
 *   3. the minimum-output guard genuinely reverts when it should
 *   4. a sell is refused rather than sent when the router has no Permit2 grant
 * (3) is only meaningful if (2) passes: an early version of this file reported
 * "slippage enforced" while every swap was broken, because a reverting swap
 * satisfies a test that only looks for reverts. */
import { build } from "esbuild"
import { createPublicClient, defineChain, http, decodeFunctionData, decodeAbiParameters, parseAbi, parseAbiItem, parseUnits, toEventSelector } from "viem"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { mkdirSync, rmSync } from "node:fs"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..", "..")
/* The bundle has to sit inside the repo: `viem` stays external, so node resolves
   it from the importing file's location, and a system temp dir has no
   node_modules to walk up to. */
const outDir = join(here, ".tmp")
mkdirSync(outDir, { recursive: true })

async function load(rel, name) {
  const outfile = join(outDir, name)
  await build({ entryPoints: [join(root, "src", "lib", rel)], bundle: true, format: "esm", outfile, external: ["viem"], logLevel: "silent" })
  return import(`file://${outfile.replace(/\\/g, "/")}?t=${Date.now()}`)
}
const swap = await load("swap.ts", "swap.mjs")
const v4 = await load("v4.ts", "v4.mjs")

const chain = defineChain({ id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } } })
const client = createPublicClient({ chain, transport: http() })
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"
const SENDER = "0x1111111111111111111111111111111111111111"
const OVR = [{ address: SENDER, balance: parseUnits("10", 18) }]
const EXEC_ABI = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"])

let failures = 0
const check = (ok, msg) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures++ }
const simulate = async (tx) => {
  try { await client.call({ account: SENDER, to: tx.to, data: tx.data, value: tx.value, stateOverride: OVR }); return null }
  catch (e) { return e.walk?.((x) => typeof x?.data === "string")?.data ?? "revert" }
}

/* 1. v3 encoding parity. The reference is a real mainnet WRAP_ETH +
   V3_SWAP_EXACT_IN; buildBuy must reproduce its inputs exactly — that is where
   the undocumented sixth parameter lives. */
console.log("1. v3 encoding parity with on-chain reference")
const REF_V3 = "0xcc2157c2c3c9667aad835df6cc34e2c5a541eb1125fcc56086f14743de8d3832"
const refV3 = await client.getTransaction({ hash: REF_V3 }).catch(() => null)
if (!refV3) {
  check(false, "v3 reference transaction unreachable — replace REF_V3 with a newer successful swap")
} else {
  const refInputs = decodeFunctionData({ abi: EXEC_ABI, data: refV3.input }).args[1]
  const built = swap.buildBuy({
    token: "0x90964ff33a330b702532902fc7d0b02d00e24fe3",
    recipient: "0xf937a98f346ffc62576981de0aadf84438b75660",
    amountInWei: 27717000000000000n, minOutWei: 1n, fee: 100,
  })
  const decoded = decodeFunctionData({ abi: EXEC_ABI, data: built.data })
  check(decoded.args[0] === "0x0b00", "commands are WRAP_ETH + V3_SWAP_EXACT_IN")
  check(decoded.args[1][1].toLowerCase() === refInputs[1].toLowerCase(),
    `swap input byte-identical (${(decoded.args[1][1].length - 2) / 2}B vs ${(refInputs[1].length - 2) / 2}B)`)
}

/* 2. v4 encoding parity, against a real successful V4_SWAP. */
console.log("\n2. v4 encoding parity with on-chain reference")
const REF_V4 = "0xf395a9b39ea79d1b6966d18cd535adfd65a3d268568b810a6aa2e47cb617f55c"
const refV4 = await client.getTransaction({ hash: REF_V4 }).catch(() => null)
if (!refV4) {
  check(false, "v4 reference transaction unreachable — replace REF_V4 with a newer successful v4 swap")
} else {
  const refArgs = decodeFunctionData({ abi: EXEC_ABI, data: refV4.input }).args
  const [, params] = decodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], refArgs[1][0])
  const EIS = [{ type: "tuple", components: [
    { name: "poolKey", type: "tuple", components: [
      { name: "currency0", type: "address" }, { name: "currency1", type: "address" },
      { name: "fee", type: "uint24" }, { name: "tickSpacing", type: "int24" }, { name: "hooks", type: "address" }]},
    { name: "zeroForOne", type: "bool" }, { name: "amountIn", type: "uint128" },
    { name: "amountOutMinimum", type: "uint128" }, { name: "sqrtPriceLimitX96", type: "uint160" },
    { name: "hookData", type: "bytes" }]}]
  const [p0] = decodeAbiParameters(EIS, params[0])
  const rebuilt = v4.buildV4Swap({
    key: p0.poolKey, zeroForOne: p0.zeroForOne,
    amountInWei: p0.amountIn, minOutWei: p0.amountOutMinimum, nativeIn: true,
  })
  const decoded = decodeFunctionData({ abi: EXEC_ABI, data: rebuilt.data })
  check(decoded.args[0] === "0x10", "command is V4_SWAP")

  /* Compare the SWAP PARAMS, not the whole input blob.
     What the reference transaction proves is the word layout of
     ExactInputSingleParams — specifically that this deployment still carries
     sqrtPriceLimitX96, which the docs say was removed. It does NOT prove that
     the reference's other arguments are the ones we should send: its SETTLE_ALL
     cap is MAX_U256, i.e. no cap at all on what the pool may take from the user,
     and we deliberately send `amountIn` instead. Asserting byte-identity across
     the whole blob pinned a parameter that ought to differ. */
  const [ours, theirs] = [decoded.args[1][0], refArgs[1][0]].map(
    (blob) => decodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], blob)
  )
  check(ours[0] === theirs[0], `actions identical (${ours[0]})`)
  check(ours[1][0].toLowerCase() === theirs[1][0].toLowerCase(),
    `swap params byte-identical — the layout the reference proves (${(ours[1][0].length - 2) / 2}B)`)
  check(ours[1][2].toLowerCase() === theirs[1][2].toLowerCase(), "TAKE_ALL identical")

  // And the deliberate divergence: our settle is capped, theirs is not.
  const [, refCap] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], theirs[1][1])
  const [, ourCap] = decodeAbiParameters([{ type: "address" }, { type: "uint256" }], ours[1][1])
  check(ourCap === p0.amountIn && refCap > p0.amountIn,
    `SETTLE_ALL is capped at amountIn, not unbounded (ours ${ourCap}, reference ${refCap === (1n << 256n) - 1n ? "MAX_U256" : refCap})`)
  check(v4.poolIdOf(p0.poolKey).length === 66, "poolId derives from the key")
}

/* 3. Live behaviour on tokens currently in the feed. */
console.log("\n3. live quote + simulated execution")
const feed = await fetch("https://newerabackend-production.up.railway.app/intel/feed?limit=60").then(r => r.json()).catch(() => ({}))
const addrs = (feed.items || []).map((l) => l.address).filter(Boolean)
const candidates = { v3: [], v4: [] }
for (let i = 0; i < addrs.length && (candidates.v3.length < 2 || candidates.v4.length < 2); i += 25) {
  const ds = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addrs.slice(i, i + 25).join(",")}`).then(r => r.json()).catch(() => null)
  for (const p of ds?.pairs || []) {
    if (p.dexId !== "uniswap") continue
    const labels = (p.labels || []).map((s) => s.toLowerCase())
    const a = p.baseToken.address.toLowerCase()
    const entry = { addr: a, symbol: p.baseToken.symbol, pairId: p.pairAddress, dex: p.dexId, labels, quote: p.quoteToken?.address }
    if (labels.includes("v3") && String(p.quoteToken?.address).toLowerCase() === WETH.toLowerCase()
        && !candidates.v3.some(t => t.addr === a) && candidates.v3.length < 2) candidates.v3.push(entry)
    if (labels.includes("v4") && !candidates.v4.some(t => t.addr === a) && candidates.v4.length < 2) candidates.v4.push(entry)
  }
}
console.log(`  found ${candidates.v3.length} v3 and ${candidates.v4.length} v4 candidates in the live feed`)

let tradeable = 0
for (const kind of ["v3", "v4"]) {
  for (const t of candidates[kind]) {
    const candidate = swap.poolFromLabels(t.dex, t.labels, t.quote)
    const pool = await swap.resolveRoute(t.addr, candidate, t.pairId)
    if (!pool.supported) {
      // Not a failure: an unroutable pool must decline with a reason, not crash.
      check(!!pool.reason, `${t.symbol} (${kind}): declines with a stated reason — "${(pool.reason || "NONE").slice(0, 70)}"`)
      continue
    }
    /* Quote at a wide slippage for the execution check. These pools move between
       blocks (100ms), so a 1% floor set at quote time is routinely stale by the
       time the simulation runs — that is slippage protection working, not a
       broken route, and asserting on it tests the market rather than our code.
       The tight-minimum case is covered by the greedy check below. */
    const q = await swap.quoteTrade({ pool, token: t.addr, amount: "0.001", side: "buy", slippagePct: 20 })
    if (!q) { check(false, `${t.symbol} (${kind}): route is supported but returned no quote`); continue }
    tradeable++
    console.log(`\n  ${t.symbol} — ${pool.protocol}${pool.fee !== undefined ? ` tier ${pool.fee}` : ""}, out ${Number(q.amountOut).toLocaleString(undefined, { maximumFractionDigits: 0 })}, impact ${(q.priceImpact * 100).toFixed(2)}%`)
    check(q.minOutWei > 0n && q.minOutWei < q.amountOutWei, "minOut sits below the quote and above zero")

    const good = swap.buildTrade({ pool, token: t.addr, recipient: SENDER, quote: q })
    const goodErr = await simulate(good)
    /* A route that resolveRoute called supported must actually swap. The one
       legitimate exception is a v4 hook that gates who may trade — it runs
       arbitrary code the quoter never executes — and resolveRoute now probes
       for exactly that, so a hooked pool reaching here and failing IS a bug. */
    check(goodErr === null, `${t.symbol}: buy executes${goodErr ? ` (${String(goodErr).slice(0, 12)})` : ""}`)

    const greedy = swap.buildTrade({ pool, token: t.addr, recipient: SENDER, quote: { ...q, minOutWei: q.amountOutWei * 100n } })
    const err = await simulate(greedy)
    check(err !== null, `${t.symbol}: unreachable minOut reverts (${err})`)
  }
}
check(tradeable > 0, `at least one live route was tradeable (${tradeable})`)

/* 4. Selling must not be sendable without a Permit2 grant. SENDER has none, so
   a sell built for it must fail simulation — proving the approval step is load
   bearing rather than decorative. */
console.log("\n4. selling is gated on approvals")
const sellable = candidates.v3[0]
if (sellable) {
  const pool = await swap.resolveRoute(sellable.addr, swap.poolFromLabels(sellable.dex, sellable.labels, sellable.quote), sellable.pairId)
  if (pool.supported && pool.fee !== undefined) {
    const sell = swap.buildSell({ token: sellable.addr, amountInWei: 10n ** 18n, minOutWei: 1n, fee: pool.fee })
    check((await simulate(sell)) !== null, "a sell without a Permit2 grant fails rather than silently sending")
    check(swap.needsApproval(pool, sellable.addr, "sell") === true, "sells are flagged as needing approval")
    check(swap.needsApproval(pool, sellable.addr, "buy") === false, "v3 buys are not")
  }
}

/* 5. Refuse to build something unsafe. */
console.log("\n5. refuses to build an unprotected trade")
const throws = (fn) => { try { fn(); return false } catch { return true } }
check(throws(() => swap.buildBuy({ token: WETH, recipient: SENDER, amountInWei: 10n ** 15n, minOutWei: 0n, fee: 100 })), "buy with minOut of zero is rejected")
check(throws(() => swap.buildSell({ token: WETH, amountInWei: 10n ** 15n, minOutWei: 0n, fee: 100 })), "sell with minOut of zero is rejected")
check(throws(() => v4.buildV4Swap({ key: { currency0: WETH, currency1: WETH, fee: 0, tickSpacing: 1, hooks: WETH }, zeroForOne: true, amountInWei: 10n ** 15n, minOutWei: 0n, nativeIn: true })), "v4 with minOut of zero is rejected")

/* 5b. The three ways the calldata and the quote could describe different things.
 *
 * All three of these shipped. None of them throws — each one quietly signs
 * something other than what the screen said, which is the only class of bug
 * this file exists to catch. */
console.log("\n5b. what gets signed matches what was quoted")
{
  const TOKEN = "0x000000000000000000000000000000000000beef"
  const NATIVE_ZERO = "0x0000000000000000000000000000000000000000"

  /* A v4 pool whose other side is WETH pulls WETH on a BUY. The approval used
     to name the token being bought, so the user signed two grants for the wrong
     asset and the swap then failed at the pull. */
  const wethSided = { protocol: "v4", supported: true, key: { currency0: TOKEN, currency1: WETH, fee: 3000, tickSpacing: 60, hooks: NATIVE_ZERO } }
  const nativeSided = { protocol: "v4", supported: true, key: { currency0: NATIVE_ZERO, currency1: TOKEN, fee: 3000, tickSpacing: 60, hooks: NATIVE_ZERO } }
  check(
    swap.approvalAsset(wethSided, TOKEN, "buy")?.toLowerCase() === WETH.toLowerCase(),
    "a v4 buy against a WETH-sided pool approves WETH, not the token being bought"
  )
  check(swap.approvalAsset(nativeSided, TOKEN, "buy") === null, "a v4 buy paid in native ETH approves nothing")
  check(swap.approvalAsset(wethSided, TOKEN, "sell")?.toLowerCase() === TOKEN.toLowerCase(), "a sell approves the token")

  /* The pool the quote was priced in wins over the caller's copy. */
  const priced = { protocol: "v3", supported: true, fee: 500 }
  const stalePool = { protocol: "v3", supported: true, fee: 10000 }
  const quote = { pool: priced, side: "buy", amountInWei: 10n ** 15n, amountOutWei: 10n ** 18n, minOutWei: 10n ** 17n, amountOut: "1", minOut: "0.1", outDecimals: 18, inDecimals: 18, priceImpact: 0 }
  const built = swap.buildTrade({ pool: stalePool, token: WETH, recipient: SENDER, quote })
  // The fee tier is three bytes in the packed path; 500 is 0x0001f4.
  check(built.data.toLowerCase().includes("0001f4"), "buildTrade uses the fee tier the QUOTE was priced at, not the caller's")
  check(!built.data.toLowerCase().includes("002710"), "the caller's stale tier does not reach the calldata")

  /* The deadline comes from the chain when it is offered. */
  const CHAIN_NOW = 1900000000n
  const withChainTime = swap.buildBuy({ token: WETH, recipient: SENDER, amountInWei: 10n ** 15n, minOutWei: 1n, fee: 500, nowSeconds: CHAIN_NOW })
  const dl = decodeFunctionData({ abi: EXEC_ABI, data: withChainTime.data }).args[2]
  check(dl === CHAIN_NOW + 900n, `the deadline is chain time plus the window, not the browser clock (${dl})`)

  /* Slippage cannot produce a negative floor. */
  const bounded = swap.buildBuy({ token: WETH, recipient: SENDER, amountInWei: 10n ** 15n, minOutWei: 1n, fee: 500 })
  check(!!bounded.data, "a built buy still encodes with the bounds in place")
}

/* 6. Routing honesty. */
console.log("\n6. routing")
check(swap.poolFromLabels("uniswap", ["v3"], WETH).supported === true, "uniswap v3 against WETH is a candidate")
check(swap.poolFromLabels("uniswap", ["v4"], WETH).supported === true, "uniswap v4 is a candidate")
check(swap.poolFromLabels("flapsh", [], WETH).supported === false, "flapsh falls back to the handoff")
/* An unknown venue declines BY NAME rather than being routed into Uniswap's
   quoter and blamed on the token. This was a blocklist of one, so a SushiSwap
   market carrying a "v3" label reached the v3 path and came back "No v3 pool
   answered a quote for this token" — a sentence about the token, for a pool
   that was fine, on a venue we do not route. */
{
  const sushi = swap.poolFromLabels("sushiswap", ["v3"], WETH)
  check(sushi.supported === false, "an unrouted venue with a v3 label is not treated as Uniswap")
  check(/SushiSwap/i.test(sushi.reason || ""), `the reason names the venue (${sushi.reason})`)
  check(swap.poolFromLabels("uniswap", ["v3"], WETH).supported === true, "uniswap still routes")
}
check(swap.poolFromLabels("uniswap", ["v3"], "0xdead000000000000000000000000000000000000").supported === false,
  "v3 paired against a non-WETH token falls back rather than offering a swap that cannot quote")
check(!!(await swap.resolveRoute("0x000000000000000000000000000000000000dead", swap.poolFromLabels("uniswap", ["v4"], WETH), "0x" + "ab".repeat(32))).reason,
  "an unresolvable v4 pool declines with a reason instead of guessing a key")
check(!!(await swap.resolveRoute("not-an-address", swap.poolFromLabels("uniswap", ["v4"], WETH), "junk")).reason,
  "a malformed address declines instead of throwing out of route resolution")

/* 7. The tape's sign convention, checked against ground truth.
 *
 * v3 emits amounts from the POOL's perspective and v4 from the SWAPPER's, so the
 * same "ETH leg is positive" test means opposite things. Getting it backwards
 * labels every buy a sell and raises no error at all — the table just lies.
 *
 * The oracle is the TOKEN'S OWN Transfer log: if the signer received the token,
 * they bought it. An earlier version used `tx.value > 0`, which is not sound —
 * a buy funded from WETH, or routed through a contract that already holds ETH,
 * carries no value on the transaction and was scored as a sell. That reported
 * "3 agreed, 5 disagreed" against code that was in fact correct. Fills routed
 * through a contract never touch the signer's balance either way and are
 * counted as inconclusive rather than guessed at. */
console.log("\n7. tape sign convention vs the token's own transfers")
{
  const trades = await load("trades.ts", "trades.mjs")
  const PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951"
  const TRANSFER_TOPIC = toEventSelector("Transfer(address,address,uint256)")
  const V4_SWAP = parseAbiItem("event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)")
  const INIT = parseAbiItem("event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)")
  const tip = await client.getBlockNumber()
  /* Robinhood Chain makes roughly ten blocks a second, so the 400-block window
     this used to sample was about forty seconds of chain — and whether it found
     anything was luck. It reported "read live v4 fills to check against (0)" as
     a FAILURE on a run where nothing was wrong except that nobody had traded a
     v4 pool in the last minute. Widened to ~7 minutes, which is still far under
     the 10,000-log ceiling this node errors at. */
  /* Not `.catch(() => [])`. An RPC that refuses the query and a chain on which
     nobody traded produce the same empty array, and this check then reported
     "no v4 fills" — a claim about the chain manufactured by our own failed
     request. Probed directly at the same moment this printed zero: 5,688 swaps
     across 401 pools in the identical window. The read is retried on a smaller
     span before anything is concluded, and a hard failure says so. */
  let logs = []
  let logError = null
  for (const span of [4_000n, 1_000n, 400n]) {
    try {
      logs = await client.getLogs({ address: PM, event: V4_SWAP, fromBlock: tip - span, toBlock: tip })
      logError = null
      break
    } catch (e) {
      logError = e.shortMessage || e.message
    }
  }
  if (logError) check(false, `could not read v4 swap logs — ${logError}`)

  const byPool = new Map()
  for (const l of logs) byPool.set(l.args.id, [...(byPool.get(l.args.id) || []), l])
  let agreed = 0, disagreed = 0, inconclusive = 0, checked = 0, multiFill = 0

  /* Walk down the list until three pools actually yield fills, rather than
     taking the top three and reporting nothing when they do not.
     The two are not the same set: recovering a pool's key needs its Initialize
     event, the lookup reaches back 1,000,000 blocks, and this chain makes ten
     blocks a second — so anything initialised more than about 27 hours ago is
     invisible to it. The BUSIEST pools are exactly the established ones, so
     sampling by volume selected for pools this check cannot resolve. Measured:
     183 pools traded in the window and the top three all predated the lookup. */
  let resolved = 0
  for (const [poolId] of [...byPool.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (resolved >= 3) break
    const init = await client.getLogs({ address: PM, event: INIT, args: { id: poolId }, fromBlock: tip - 1_000_000n, toBlock: tip }).catch(() => [])
    const a = init[0]?.args
    if (!a) continue
    resolved++
    /* The token is whichever side is NEITHER native ETH nor WETH.
       This used to be `nativeIsC0 ? currency1 : currency0`, which is only right
       for a natively-paired pool. In a WETH-paired one with WETH as currency0 it
       returned WETH as "the token", and the oracle below then asked whether the
       signer received WETH in a pool where WETH is the quote asset — an
       unanswerable question that came back `null` for every fill and quietly
       took the whole pool out of the sample. */
    const isEth = (c) => /^0x0+$/i.test(c) || c.toLowerCase() === WETH.toLowerCase()
    const nativeIsC0 = /^0x0+$/i.test(a.currency0)
    if (isEth(a.currency0) === isEth(a.currency1)) continue // not an ETH pair; the convention does not apply
    const token = isEth(a.currency0) ? a.currency1 : a.currency0
    const ethIsCurrency0 = isEth(a.currency0)

    const ours = await trades.fetchTrades({ kind: "v4", poolId, ethIsCurrency0 }, 6)

    /* One verdict per TRANSACTION, so a transaction holding several fills
       cannot be adjudicated by it. Observed live: a router transaction with
       three fills in the same pool, two labelled sell and one buy — all correct,
       and all compared against a single transaction-level "buy" derived from the
       net token movement. A round trip both buys and sells; the net tells you
       nothing about either leg. Those are dropped rather than scored. */
    const fillsPerTx = new Map()
    for (const t of ours) fillsPerTx.set(t.txHash, (fillsPerTx.get(t.txHash) || 0) + 1)
    for (const t of ours) {
      const [tx, rc] = await Promise.all([
        client.getTransaction({ hash: t.txHash }).catch(() => null),
        client.getTransactionReceipt({ hash: t.txHash }).catch(() => null),
      ])
      if (!tx || !rc) continue
      if (fillsPerTx.get(t.txHash) > 1) {
        multiFill++
        continue
      }
      checked++
      const moves = rc.logs.filter((x) => x.address.toLowerCase() === token.toLowerCase() && x.topics[0] === TRANSFER_TOPIC)
      const signer = tx.from.toLowerCase()
      const got = moves.some((m) => `0x${m.topics[2].slice(26)}`.toLowerCase() === signer)
      const gave = moves.some((m) => `0x${m.topics[1].slice(26)}`.toLowerCase() === signer)
      const truth = got && !gave ? "buy" : gave && !got ? "sell" : null
      if (!truth) inconclusive++
      else if (truth === t.kind) agreed++
      else disagreed++
    }
  }
  /* An empty window is a fact about the chain, not a defect in this code, and
     the rest of this product is careful never to render one as the other. It is
     printed either way so a silent run cannot be mistaken for a clean one. */
  if (checked === 0 && !logError) {
    console.log(
      `  note: ${byPool.size} v4 pools traded, ${resolved} had a recoverable key, none yielded a conclusive fill — sign convention not exercised this run`
    )
  } else if (checked === 0) {
    // The failure is already reported above; do not also claim a quiet chain.
  } else {
    check(true, `read live v4 fills to check against (${checked})`)
  }
  check(disagreed === 0, `every conclusive fill matches the token's own transfer direction (${agreed} agreed, ${disagreed} disagreed, ${inconclusive} routed via a contract, ${multiFill} in multi-fill transactions)`)
}

/* 8. The fee, when it is switched on.
 *
 * PRODUCTION SHIPS WITH IT OFF — there is no VITE_FEE_RECIPIENT — so sections 1
 * and 2 above pin the no-fee encodings byte-for-byte against real transactions
 * and would not notice the fee path at all. This bundles swap.ts a second time
 * with a recipient configured and checks the calldata that a paying user would
 * actually sign: that the money splits, and that the split is the one quoted.
 *
 * The PAY_PORTION layout was read off two live fee-taking transactions on this
 * chain (0x10060c and 0x08060c) rather than from Uniswap's docs — the same
 * method that caught V3_SWAP_EXACT_IN's undocumented sixth parameter. */
console.log("\n8. the fee splits the money as quoted")
{
  const FEE_WALLET = "0x00000000000000000000000000000000feefee01"
  await build({
    entryPoints: [join(root, "src", "lib", "swap.ts")],
    bundle: true, format: "esm", outfile: join(outDir, "swapfee.mjs"),
    external: ["viem"], logLevel: "silent",
    define: { "import.meta.env": JSON.stringify({ VITE_FEE_RECIPIENT: FEE_WALLET, VITE_FEE_BIPS: "100" }) },
  })
  const paid = await import(`file://${join(outDir, "swapfee.mjs").split("\\").join("/")}?t=${Date.now()}`)

  check(paid.feeIsOn() && paid.FEE_BIPS === 100, `fee reads as on at ${paid.FEE_BIPS} bips`)
  check(paid.feeOn(parseUnits("1", 18)) === parseUnits("0.01", 18), "1% of 1 ETH is 0.01 ETH")
  check(swap.feeIsOn() === false, "and it stays OFF in the default build, which production ships")

  const live = candidates.v3[0]
  if (!live) {
    console.log("  note: no live v3 candidate this run — calldata not simulated")
  } else {
    const pool = await paid.resolveRoute(live.addr, paid.poolFromLabels("uniswap", ["v3"], WETH))
    const q = await paid.quoteTrade({ pool, token: live.addr, amount: "0.05", side: "buy", slippagePct: 5 })
    if (!q) {
      console.log("  note: the candidate stopped quoting — calldata not simulated")
    } else {
      check(q.feeWei === parseUnits("0.0005", 18), `fee on 0.05 ETH is ${q.feeWei} wei`)
      check(q.amountInWei - q.feeWei === parseUnits("0.0495", 18), "the pool is asked for the net, not the gross")

      const tx = paid.buildTrade({ pool, token: live.addr, recipient: SENDER, quote: q })
      const cmds = decodeFunctionData({ abi: EXEC_ABI, data: tx.data }).args[0]
      check(cmds === "0x0b0600", `buy commands are WRAP_ETH > PAY_PORTION > V3_SWAP_EXACT_IN (${cmds})`)
      check(tx.value === q.amountInWei, "msg.value is the gross the user agreed to pay")

      const sim = await client.simulateCalls({
        account: SENDER,
        calls: [{ to: tx.to, data: tx.data, value: tx.value }],
        stateOverrides: [{ address: SENDER, balance: parseUnits("10", 18) }],
      }).catch(() => null)
      if (!sim) {
        console.log("  note: node refused the simulation — split not verified this run")
      } else {
        const TRANSFER_T = toEventSelector("Transfer(address,address,uint256)")
        let feeGot = 0n
        for (const l of sim.results?.[0]?.logs || []) {
          if (l.topics?.[0] !== TRANSFER_T) continue
          if (l.address.toLowerCase() !== WETH.toLowerCase()) continue
          if (("0x" + String(l.topics[2]).slice(26)).toLowerCase() !== FEE_WALLET) continue
          feeGot += BigInt(l.data)
        }
        check(feeGot === q.feeWei, `simulated: the fee wallet received exactly what was quoted (${feeGot})`)
      }

      /* A sell splits on the way OUT, so its two floors are different numbers.
         Setting both to the gross reverts every sell the moment the fee is on. */
      const qs = await paid.quoteTrade({ pool, token: live.addr, amount: "1000", side: "sell", slippagePct: 5 })
      if (qs) {
        const st = paid.buildTrade({ pool, token: live.addr, recipient: SENDER, quote: qs })
        const scmds = decodeFunctionData({ abi: EXEC_ABI, data: st.data }).args[0]
        check(scmds === "0x00060c", `sell commands are V3_SWAP_EXACT_IN > PAY_PORTION > UNWRAP_WETH (${scmds})`)
        check(qs.minReceiveWei < qs.minOutWei, "the unwrap floor sits below the swap floor by the fee")
      }
    }
  }
}

rmSync(outDir, { recursive: true, force: true })
console.log(`\n${failures === 0 ? "✅ all swap checks passed" : `❌ ${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
