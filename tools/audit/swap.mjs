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
  check(decoded.args[1][0].toLowerCase() === refArgs[1][0].toLowerCase(),
    `v4 input byte-identical (${(decoded.args[1][0].length - 2) / 2}B vs ${(refArgs[1][0].length - 2) / 2}B)`)
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

/* 6. Routing honesty. */
console.log("\n6. routing")
check(swap.poolFromLabels("uniswap", ["v3"], WETH).supported === true, "uniswap v3 against WETH is a candidate")
check(swap.poolFromLabels("uniswap", ["v4"], WETH).supported === true, "uniswap v4 is a candidate")
check(swap.poolFromLabels("flapsh", [], WETH).supported === false, "flapsh falls back to the handoff")
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
  const logs = await client.getLogs({ address: PM, event: V4_SWAP, fromBlock: tip - 400n, toBlock: tip }).catch(() => [])

  const byPool = new Map()
  for (const l of logs) byPool.set(l.args.id, [...(byPool.get(l.args.id) || []), l])
  let agreed = 0, disagreed = 0, inconclusive = 0, checked = 0

  for (const [poolId] of [...byPool.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 3)) {
    const init = await client.getLogs({ address: PM, event: INIT, args: { id: poolId }, fromBlock: tip - 1_000_000n, toBlock: tip }).catch(() => [])
    const a = init[0]?.args
    if (!a) continue
    const nativeIsC0 = /^0x0+$/i.test(a.currency0)
    const token = nativeIsC0 ? a.currency1 : a.currency0
    const ethIsCurrency0 = nativeIsC0 || a.currency0.toLowerCase() === WETH.toLowerCase()

    const ours = await trades.fetchTrades({ kind: "v4", poolId, ethIsCurrency0 }, 6)
    for (const t of ours) {
      const [tx, rc] = await Promise.all([
        client.getTransaction({ hash: t.txHash }).catch(() => null),
        client.getTransactionReceipt({ hash: t.txHash }).catch(() => null),
      ])
      if (!tx || !rc) continue
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
  check(checked > 0, `read live v4 fills to check against (${checked})`)
  check(disagreed === 0, `every conclusive fill matches the token's own transfer direction (${agreed} agreed, ${disagreed} disagreed, ${inconclusive} routed via a contract)`)
}

rmSync(outDir, { recursive: true, force: true })
console.log(`\n${failures === 0 ? "✅ all swap checks passed" : `❌ ${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
