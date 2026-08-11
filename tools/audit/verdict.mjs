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
/* The LADDER, not a component. Both the token page and the feed row ask this
   one module, so testing it tests both — and the last check below is that the
   two renderings of the same judgement cannot contradict each other. */
await build({
  entryPoints: [join(root, "src", "lib", "distributionVerdict.ts")],
  bundle: true, format: "esm", outfile: join(outDir, "dist.mjs"), logLevel: "silent",
})
const { judgeDistribution } = await import("file://" + join(outDir, "dist.mjs").split("\\").join("/") + "?t=" + Date.now())
const readDistribution = (d) => { const v = judgeDistribution(d); return { text: v.sentence, tone: v.severity, badge: v.badge } }

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

console.log("\nthe row badge and the page sentence agree")
{
  /* They render the same judgement in different lengths. If a row can show a
     badge while the page calls the token healthy, one of them is lying — and a
     reader will believe whichever they saw first. */
  const cases = [D({holders:0}), D({holders:1}), D({holders:3}), D({devHoldsPct:53}), D({devHoldsPct:25}),
    D({top10Pct:95}), D({firstBuyers:5,firstBuyersStillHolding:0}), D({devSold:true}), D({top10Pct:75}), D({top10Pct:40})]
  const contradictions = cases.map(judgeDistribution).filter(
    (v) => (v.severity === "ok") !== (v.badge === null)
  )
  ok(contradictions.length === 0,
    contradictions.length
      ? `a badge disagrees with its sentence: ${contradictions.map(c=>c.badge+" / "+c.sentence).join(" | ")}`
      : "every adverse judgement carries a badge, and only healthy ones carry none")

  const long = judgeDistribution(D({ devHoldsPct: 53 }))
  ok(/53/.test(long.badge) && /53/.test(long.sentence), "the badge quotes the same figure as the sentence")
}

rmSync(outDir, { recursive: true, force: true })
console.log(`\n${fail === 0 ? "✅ verdict checks passed" : `❌ ${fail} FAILED`}`)
process.exit(fail === 0 ? 0 : 1)
