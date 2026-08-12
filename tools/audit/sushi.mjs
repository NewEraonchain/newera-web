/* Does the SushiSwap route actually execute?
 *
 * Everything else about this venue was discovered by reading the chain rather
 * than a docs page — the router came from the indexed `sender` on a pool's Swap
 * event, the quoter from the factory deployer's other contracts — so none of it
 * is trustworthy until a built transaction survives `eth_call` against the real
 * pool.
 *
 * The test is deliberately the whole path: quote it, build the calldata the
 * user would sign, then simulate that exact calldata from an address funded
 * only by a state override. A revert here means we would have taken somebody's
 * signature for a transaction that fails.
 *
 *   node tools/audit/sushi.mjs
 */
import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { mkdirSync, rmSync } from "node:fs"
import { createPublicClient, http, parseEther, formatEther, formatUnits } from "viem"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..", "..")
const outDir = join(here, ".tmp-sushi")
mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [join(root, "src", "lib", "swap.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: join(outDir, "swap.mjs"),
  logLevel: "silent",
  define: { "import.meta.env": "{}" },
})
await build({
  entryPoints: [join(root, "src", "lib", "permit2.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: join(outDir, "permit2.mjs"),
  logLevel: "silent",
  define: { "import.meta.env": "{}" },
})
const swap = await import(
  "file://" + join(outDir, "swap.mjs").split("\\").join("/") + "?t=" + Date.now()
)

const RPC = "https://rpc.mainnet.chain.robinhood.com"
const client = createPublicClient({ transport: http(RPC) })
const PROBE = "0x1111111111111111111111111111111111111111"

let fail = 0
const ok = (c, m) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`)
  if (!c) fail++
}

/* A live SushiSwap pair. Picked because it is the deepest one on the venue, so
   a failure here is the route and not an empty pool. */
const TOKEN = "0x0ab8d01664d4bB625705f9F3c595a8a19B3dCFb0" // sushicat

console.log("1. the venue is recognised and resolves to a tier")
const candidate = swap.poolFromLabels("sushiswap", ["v3"], "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73")
ok(candidate.protocol === "sushi", `a sushiswap v3 pair is protocol "sushi" (got "${candidate.protocol}")`)
ok(candidate.supported === true, "and it is supported rather than handed off")

const pool = await swap.resolveRoute(TOKEN, candidate)
ok(pool.supported && pool.fee !== undefined, `resolveRoute found a fee tier (${pool.fee})`)

console.log("\n2. it quotes on Sushi's quoter, not Uniswap's")
const quote = await swap.quoteTrade({
  pool,
  token: TOKEN,
  amount: "0.01",
  side: "buy",
  slippagePct: 5,
  tokenDecimals: 18,
})
ok(!!quote && quote.amountOutWei > 0n, `a 0.01 ETH buy quotes ${quote ? formatUnits(quote.amountOutWei, 18) : "nothing"}`)

console.log("\n3. the built transaction survives simulation on chain")
if (quote) {
  const tx = swap.buildTrade({ pool, token: TOKEN, recipient: PROBE, quote })
  ok(
    tx.to.toLowerCase() === "0xb2d8ed81e79eb64a0751352459ec215fbafad669",
    `it targets Sushi's SwapRouter02, not the Universal Router (${tx.to})`
  )
  ok(tx.value === quote.amountInWei, "a buy sends the input as msg.value")
  try {
    await client.call({
      account: PROBE,
      to: tx.to,
      data: tx.data,
      value: tx.value,
      stateOverride: [{ address: PROBE, balance: parseEther("1") }],
    })
    ok(true, "eth_call executes the multicall without reverting")
  } catch (e) {
    ok(false, `eth_call REVERTED: ${(e.shortMessage || e.message || "").slice(0, 160)}`)
  }

  /* The minimum is the only number the chain enforces, so an impossible one
     must be REJECTED. If this passes, the slippage guard is not wired to
     anything and every trade is unprotected. */
  const greedy = { ...quote, minOutWei: quote.amountOutWei * 10n }
  const greedyTx = swap.buildTrade({ pool, token: TOKEN, recipient: PROBE, quote: greedy })
  try {
    await client.call({
      account: PROBE,
      to: greedyTx.to,
      data: greedyTx.data,
      value: greedyTx.value,
      stateOverride: [{ address: PROBE, balance: parseEther("1") }],
    })
    ok(false, "a 10x minimum was ACCEPTED — the slippage floor is not enforced")
  } catch {
    ok(true, "a 10x minimum reverts, so the slippage floor is real")
  }
}

console.log("\n4. selling asks for the right grant")
const permit2 = await import("file://" + join(outDir, "permit2.mjs").split("\\").join("/") + "?t=" + Date.now())
const steps = await permit2.missingApprovals(TOKEN, PROBE, 1n, "sushi")
const grant = permit2.buildApproval("sushi", TOKEN)
ok(
  steps.length === 1 && steps[0] === "sushi",
  `one grant, not Permit2's two (${JSON.stringify(steps)})`
)
ok(
  grant.to.toLowerCase() === TOKEN.toLowerCase(),
  "the approval is sent to the token contract"
)
ok(
  grant.data.toLowerCase().includes("b2d8ed81e79eb64a0751352459ec215fbafad669"),
  "and it names Sushi's router as the spender, not Permit2"
)

rmSync(outDir, { recursive: true, force: true })
console.log(`\n${fail === 0 ? "✅ sushi route verified against the chain" : `❌ ${fail} FAILED`}`)
process.exit(fail === 0 ? 0 : 1)
