/* Swap safety suite — exercises src/lib/swap.ts itself, not a copy of it.
 *
 * This is the one audit where a regression costs money rather than pixels, so
 * it asserts three things against the live chain:
 *   1. the encoding still reproduces a real successful on-chain swap byte for byte
 *   2. a well-formed buy actually executes (simulated with a balance override)
 *   3. the minimum-output guard genuinely reverts when it should
 * (3) is the one that matters, and it is only meaningful if (2) passes: an
 * earlier version of this file reported "slippage enforced" while every swap was
 * broken, because a reverting swap satisfies a test that only looks for reverts. */
import { build } from "esbuild"
import { createPublicClient, defineChain, http, decodeFunctionData, parseAbi, parseUnits } from "viem"
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
const bundle = join(outDir, "swap.mjs")
await build({
  entryPoints: [join(root, "src", "lib", "swap.ts")],
  bundle: true, format: "esm", outfile: bundle, external: ["viem"], logLevel: "silent",
})
const swap = await import(`file://${bundle.replace(/\\/g, "/")}`)

const chain = defineChain({ id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } } })
const client = createPublicClient({ chain, transport: http() })
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"
const SENDER = "0x1111111111111111111111111111111111111111"
const OVR = [{ address: SENDER, balance: parseUnits("10", 18) }]
const EXEC_ABI = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"])

let failures = 0
const check = (ok, msg) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures++ }

/* 1. Encoding parity with a known-good swap. The reference is a real mainnet
   WRAP_ETH + V3_SWAP_EXACT_IN. buildBuy must reproduce its inputs exactly —
   that is where the undocumented sixth parameter lives. */
console.log("1. encoding parity with on-chain reference")
const REF_TX = "0xcc2157c2c3c9667aad835df6cc34e2c5a541eb1125fcc56086f14743de8d3832"
const refTx = await client.getTransaction({ hash: REF_TX }).catch(() => null)
if (!refTx) {
  check(false, "reference transaction unreachable — replace REF_TX with a newer successful swap")
} else {
  const refInputs = decodeFunctionData({ abi: EXEC_ABI, data: refTx.input }).args[1]
  const built = swap.buildBuy({
    token: "0x90964ff33a330b702532902fc7d0b02d00e24fe3",
    recipient: "0xf937a98f346ffc62576981de0aadf84438b75660",
    amountInWei: 27717000000000000n, minOutWei: 1n, fee: 100,
  })
  const decoded = decodeFunctionData({ abi: EXEC_ABI, data: built.data })
  check(decoded.args[0] === "0x0b00", "commands are WRAP_ETH + V3_SWAP_EXACT_IN")
  check(decoded.args[1][0].toLowerCase() === refInputs[0].toLowerCase(), "wrap input byte-identical")
  check(decoded.args[1][1].toLowerCase() === refInputs[1].toLowerCase(),
    `swap input byte-identical (${(decoded.args[1][1].length - 2) / 2}B vs ${(refInputs[1].length - 2) / 2}B)`)
}

/* 2. Live behaviour on tokens currently in the feed. */
console.log("\n2. live quote + simulated execution")
const feed = await fetch("https://newerabackend-production.up.railway.app/intel/feed?limit=60").then(r => r.json()).catch(() => ({}))
const addrs = (feed.items || []).map((l) => l.address).filter(Boolean)
const v3 = []
for (let i = 0; i < addrs.length && v3.length < 3; i += 25) {
  const ds = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addrs.slice(i, i + 25).join(",")}`).then(r => r.json()).catch(() => null)
  for (const p of ds?.pairs || []) {
    const labels = (p.labels || []).map((s) => s.toLowerCase())
    const a = p.baseToken.address.toLowerCase()
    /* Must be paired against WETH. A token can have several pairs at once — one
       v3 against a stablecoin and one v4 against ETH — and matching on the
       protocol label alone picks tokens that no ETH swap can ever quote. */
    const vsEth = String(p.quoteToken?.address || "").toLowerCase() === WETH.toLowerCase()
    if (p.dexId === "uniswap" && labels.includes("v3") && vsEth && !v3.some((t) => t.addr === a)) {
      v3.push({ addr: a, symbol: p.baseToken.symbol })
    }
  }
}
check(v3.length > 0, `found ${v3.length} v3-backed tokens in the live feed`)

const simulate = async (tx) => {
  try { await client.call({ account: SENDER, to: tx.to, data: tx.data, value: tx.value, stateOverride: OVR }); return null }
  catch (e) { return e.walk?.((x) => typeof x?.data === "string")?.data ?? "revert" }
}

for (const t of v3) {
  const q = await swap.quoteBuy(t.addr, "0.001", 1)
  if (!q) { check(false, `${t.symbol}: no quote returned`); continue }
  console.log(`\n  ${t.symbol} — tier ${q.pool.fee}, out ${Number(q.amountOut).toLocaleString(undefined, { maximumFractionDigits: 0 })}, impact ${(q.priceImpact * 100).toFixed(2)}%`)
  check(q.minOutWei > 0n && q.minOutWei < q.amountOutWei, "minOut sits below the quote and above zero")

  const good = swap.buildBuy({ token: t.addr, recipient: SENDER, amountInWei: q.amountInWei, minOutWei: q.minOutWei, fee: q.pool.fee })
  check((await simulate(good)) === null, `${t.symbol}: buy executes`)

  const greedy = swap.buildBuy({ token: t.addr, recipient: SENDER, amountInWei: q.amountInWei, minOutWei: q.amountOutWei * 100n, fee: q.pool.fee })
  const err = await simulate(greedy)
  check(err === swap.V3_TOO_LITTLE_RECEIVED, `${t.symbol}: unreachable minOut reverts with V3TooLittleReceived (${err})`)
}

/* 3. Refuse to build something unsafe. */
console.log("\n3. refuses to build an unprotected swap")
const throws = (fn) => { try { fn(); return false } catch { return true } }
check(throws(() => swap.buildBuy({ token: WETH, recipient: SENDER, amountInWei: 10n ** 15n, minOutWei: 0n, fee: 100 })), "minOut of zero is rejected")
check(throws(() => swap.buildBuy({ token: WETH, recipient: SENDER, amountInWei: 0n, minOutWei: 1n, fee: 100 })), "zero input is rejected")

/* 4. Routing honesty — only v3 may claim in-app support. */
console.log("\n4. routing")
check(swap.poolFromLabels("uniswap", ["v3"], WETH).supported === true, "uniswap v3 against WETH is routed in-app")
check(swap.poolFromLabels("uniswap", ["v4"], WETH).supported === false, "uniswap v4 falls back to the handoff")
check(swap.poolFromLabels("flapsh", [], WETH).supported === false, "flapsh falls back to the handoff")
check(swap.poolFromLabels("uniswap", ["v3"], "0xdead000000000000000000000000000000000000").supported === false,
  "v3 paired against a non-WETH token falls back rather than offering a swap that cannot quote")

rmSync(outDir, { recursive: true, force: true })
console.log(`\n${failures === 0 ? "✅ all swap checks passed" : `❌ ${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
