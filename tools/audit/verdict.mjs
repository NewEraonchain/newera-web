/* Does the sentence match the numbers under it?
 *
 * The panel's whole claim is that it reads six figures and tells you what they
 * add up to. A verdict that overstates its own evidence is worse than no
 * verdict, so this checks the wording against the arithmetic — it already
 * caught "more than everyone else combined" being printed at 25%, where it is
 * simply false. */
import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { mkdirSync, rmSync } from "node:fs"
const here = dirname(fileURLToPath(import.meta.url)), root = join(here, "..", "..")
const outDir = join(here, ".tmp"); mkdirSync(outDir, { recursive: true })
await build({
  entryPoints: [join(root, "src", "components", "Distribution.tsx")],
  bundle: true, format: "esm", outfile: join(outDir, "dist.mjs"),
  external: ["react", "react/jsx-runtime", "react-dom", "@/lib/api", "@/components/shell"],
  alias: { "@": join(root, "src") },
  loader: { ".tsx": "tsx" }, jsx: "automatic", logLevel: "silent",
  // api.ts reads import.meta.env, which does not exist under Node.
  define: { "import.meta.env": JSON.stringify({}) },
})
const { readDistribution } = await import("file://" + join(outDir, "dist.mjs").split("\\").join("/") + "?t=" + Date.now())

let fail = 0
const ok = (c, m) => { console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fail++ }
const D = (o) => ({ holders: 20, top10Pct: 50, devHoldsPct: 0, devSold: false, devSoldAmount: "0",
  firstBuyers: 5, firstBuyersStillHolding: 3, ...o })

console.log("the sentence never claims more than the numbers support\n")
{
  const v = readDistribution(D({ devHoldsPct: 25 }))
  ok(!/combined/.test(v.text), `at 25% the deployer is not compared to everyone else — "${v.text}"`)
}
{
  const v = readDistribution(D({ devHoldsPct: 53.1 }))
  ok(/combined/.test(v.text), "above half, the comparison is made because it is true")
}
console.log("\nthe most consequential fact leads")
ok(readDistribution(D({ holders: 1 })).text.startsWith("One wallet"), "one holder outranks everything")
ok(/deployer/.test(readDistribution(D({ holders: 80, devHoldsPct: 53 })).text),
   "80 holders does not bury a deployer holding half")
ok(/largest ten/.test(readDistribution(D({ holders: 200, top10Pct: 95 })).text),
   "200 holders does not bury 95% concentration")

console.log("\ntone matches severity")
ok(readDistribution(D({ holders: 0 })).tone === "unknown", "nobody holding is unknown, not bad")
ok(readDistribution(D({ holders: 1 })).tone === "bad", "one holder is bad")
ok(readDistribution(D({ holders: 60, top10Pct: 45 })).tone === "ok", "a real spread reads ok")
ok(readDistribution(D({ devSold: true, holders: 60, top10Pct: 45 })).tone === "warn", "a departed deployer warns")

console.log("\nno forecast language anywhere")
const FORECAST = /\b(will|going to|likely to|expect|predict|should (buy|sell)|dump|moon|rug\b)/i
const cases = [D({holders:0}), D({holders:1}), D({holders:3}), D({devHoldsPct:53}), D({devHoldsPct:25}),
  D({top10Pct:95}), D({firstBuyers:5,firstBuyersStillHolding:0}), D({devSold:true}), D({top10Pct:75}), D({top10Pct:40})]
const bad = cases.map(readDistribution).filter(v => FORECAST.test(v.text))
ok(bad.length === 0, bad.length ? `forecast wording: ${bad.map(b=>b.text).join(" | ")}` : "every verdict is an observation, not a prediction")

rmSync(outDir, { recursive: true, force: true })
console.log(`\n${fail === 0 ? "✅ verdict checks passed" : `❌ ${fail} FAILED`}`)
process.exit(fail === 0 ? 0 : 1)
