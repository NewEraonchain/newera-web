/* Does the cost basis reconstruct correctly?
 *
 * A P&L that is wrong is worse than no P&L: a trader acts on it. There is no
 * labelled "swap" anywhere on chain, so every number here comes from an
 * inference — one token moved one way, ETH moved the other — and this checks
 * that inference against arithmetic that must hold regardless of the data.
 *
 *   node tools/audit/portfolio.mjs [wallet]
 */
import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { mkdirSync, rmSync } from "node:fs"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..", "..")
const outDir = join(here, ".tmp-portfolio")
mkdirSync(outDir, { recursive: true })

await build({
  entryPoints: [join(root, "src", "lib", "portfolio.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: join(outDir, "portfolio.mjs"),
  logLevel: "silent",
})
const { loadPortfolio, unrealisedEth } = await import(
  "file://" + join(outDir, "portfolio.mjs").split("\\").join("/") + "?t=" + Date.now()
)

let fail = 0
const ok = (c, m) => {
  console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`)
  if (!c) fail++
}

const WALLET = process.argv[2] || "0x0a0256a9166041101c90be87bbebb8242a3ba015"
console.log(`reconstructing ${WALLET}\n`)
const r = await loadPortfolio(WALLET)

console.log("1. it reads the wallet at all")
ok(!r.failed, "the explorer answered")
ok(r.positions.length > 0, `positions found (${r.positions.length})`)
console.log(`  note  priced ${r.tradesPriced} trades, ${r.tradesUntraced} untraced, history complete: ${r.historyComplete}`)

console.log("\n2. every figure is arithmetically possible")
for (const p of r.positions.slice(0, 8)) {
  const bad = []
  if (p.amount < 0) bad.push("negative balance")
  if (p.ethSpent < 0) bad.push("negative spend")
  if (p.ethReceived < 0) bad.push("negative proceeds")
  if (p.avgCostEth !== null && p.avgCostEth < 0) bad.push("negative cost")
  if (p.avgCostEth !== null && !Number.isFinite(p.avgCostEth)) bad.push("non-finite cost")
  if (!Number.isFinite(p.realisedEth)) bad.push("non-finite realised")
  ok(bad.length === 0, `${p.symbol.padEnd(12)} ${bad.length ? bad.join(", ") : "all figures finite and signed correctly"}`)
}

console.log("\n3. a cost is only claimed where one was traced")
{
  const claimed = r.positions.filter((p) => p.avgCostEth !== null)
  const withoutBuys = claimed.filter((p) => p.boughtAmount <= 0)
  ok(withoutBuys.length === 0, `no position claims an average cost without a traced buy (${claimed.length} priced)`)

  /* The trap this exists to catch: a token that arrived as an airdrop or a mint
     must NOT be priced at zero, because that reports an infinite return — and
     on this chain a deployer minting to themselves is the single most common
     shape. */
  const freeMoney = r.positions.filter((p) => p.avgCostEth === 0 && p.amount > 0)
  ok(freeMoney.length === 0, `nothing is valued as free (${freeMoney.map((p) => p.symbol).join(", ") || "none"})`)

  const untraced = r.positions.filter((p) => p.untracedAmount > 0)
  console.log(`  note  ${untraced.length} position(s) hold tokens that arrived without a priceable ETH leg`)
}

console.log("\n4. incompleteness is admitted, not smoothed over")
{
  const priced = r.positions.filter((p) => p.avgCostEth !== null)
  const honest = priced.every((p) => typeof p.costIncomplete === "boolean")
  ok(honest, "every position carries a costIncomplete flag")
  const silent = r.positions.filter((p) => p.avgCostEth === null && !p.costIncomplete)
  ok(silent.length === 0, "a position with no cost is always marked incomplete")
}

console.log("\n5. unrealised is null without a cost, not zero")
{
  const noCost = r.positions.find((p) => p.avgCostEth === null)
  if (noCost) {
    ok(unrealisedEth(noCost, 0.0001) === null, "an unpriced position reports null unrealised, never 0")
  } else {
    console.log("  skip  every position has a cost in this sample")
  }
  const withCost = r.positions.find((p) => p.avgCostEth !== null)
  if (withCost) {
    const at2x = unrealisedEth(withCost, withCost.avgCostEth * 2)
    ok(at2x !== null && at2x > 0, "doubling the price produces a positive unrealised figure")
  }
}

console.log("\ntop positions:")
for (const p of r.positions.slice(0, 6)) {
  const cost = p.avgCostEth === null ? "no cost traced" : `avg Ξ${p.avgCostEth.toExponential(2)}/tok`
  console.log(
    `  ${p.symbol.padEnd(12)} amt=${p.amount.toExponential(2).padStart(10)}  ${cost.padEnd(22)}` +
      `  spent=Ξ${p.ethSpent.toFixed(5)}  got=Ξ${p.ethReceived.toFixed(5)}  realised=Ξ${p.realisedEth.toFixed(5)}` +
      `${p.costIncomplete ? "  [incomplete]" : ""}`
  )
}

rmSync(outDir, { recursive: true, force: true })
console.log(`\n${fail === 0 ? "✅ portfolio reconstruction checks passed" : `❌ ${fail} FAILED`}`)
process.exit(fail === 0 ? 0 : 1)
