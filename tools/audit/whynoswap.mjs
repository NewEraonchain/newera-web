/* Why does a token page hand off to the venue instead of trading in-app?
 *
 * Runs the SHIPPED routing code — swap.ts, bundled on the fly — against the
 * tokens the app actually lists, and prints the reason each one declines.
 * Counting the reasons is the only way to tell "we cannot route this market"
 * from "we can route it and something in our own resolution failed". */
import { build } from "esbuild"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { mkdirSync, rmSync } from "node:fs"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..", "..")
const outDir = join(here, ".tmp")
mkdirSync(outDir, { recursive: true })
const load = async (src, out) => {
  await build({
    entryPoints: [join(root, "src", "lib", src)],
    outfile: join(outDir, out),
    bundle: true, format: "esm", platform: "node", target: "node20",
    external: ["viem"], logLevel: "silent",
    alias: { "@": join(root, "src") },
  })
  return import("file://" + join(outDir, out))
}
const swap = await load("swap.ts", "swap.mjs")

const API = "https://newerabackend-production.up.railway.app"
const DEX = "https://api.dexscreener.com/latest/dex/tokens/"

const feed = await fetch(`${API}/intel/feed?limit=60`).then((r) => r.json())
const addrs = [...new Set((feed.items || []).map((l) => l.address))]

// Same lookup the browser makes, same 25-address chunking.
const pairs = []
for (let i = 0; i < addrs.length; i += 25) {
  const r = await fetch(DEX + addrs.slice(i, i + 25).join(",")).then((r) => r.json()).catch(() => ({}))
  pairs.push(...(r.pairs || []))
}
// Deepest pool per token, exactly as markets.ts picks it.
const best = new Map()
for (const p of pairs) {
  const a = String(p?.baseToken?.address || "").toLowerCase()
  if (!a) continue
  const liq = Number(p?.liquidity?.usd) || 0
  if ((best.get(a)?.liq ?? -1) >= liq) continue
  const t = (p.txns || {}).h24 || {}
  best.set(a, { liq, vol: Number(p?.volume?.h24) || 0,
    tx: (Number(t.buys) || 0) + (Number(t.sells) || 0),
    dex: String(p.dexId || ""), labels: (p.labels || []).map(String),
    quote: String(p?.quoteToken?.address || "").toLowerCase(), pairAddress: String(p.pairAddress || ""),
    symbol: String(p?.baseToken?.symbol || "") })
}

const ranked = [...best.entries()].sort((a, b) => b[1].liq - a[1].liq)
console.log(`${addrs.length} launches in the feed, ${ranked.length} with a market\n`)

const reasons = new Map()
let routable = 0
for (const [addr, m] of ranked) {
  const candidate = swap.poolFromLabels(m.dex, m.labels, m.quote)
  const pool = candidate.supported ? await swap.resolveRoute(addr, candidate, m.pairAddress) : candidate
  const why = pool.supported ? "ROUTES IN-APP" : pool.reason || "(no reason given)"
  reasons.set(why, (reasons.get(why) || 0) + 1)
  if (pool.supported) routable++
  if (ranked.indexOf([addr, m]) < 0) { /* noop */ }
  console.log(
    `  $${String(Math.round(m.liq)).padStart(7)}  ${m.symbol.padEnd(12).slice(0, 12)} ${m.dex}/${m.labels.join(",") || "-"}  ${why}`
  )
}

/* Coverage is not the same question as demand.
 *
 * "A third of markets are on a venue we do not route" sounds like the biggest
 * gap on the product until you ask whether anyone trades there. Measured:
 * flapsh held nearly twice Uniswap's liquidity with ZERO 24h volume and 8
 * trades against Uniswap's 1,020 — it is where launches park their initial
 * liquidity, not where trading happens. Routing it would have bought coverage
 * on paper and served nobody. This table exists so the judgement is made from
 * volume rather than from pair counts. */
const byVenue = new Map()
for (const [, m] of ranked) {
  const v = byVenue.get(m.dex) || { pairs: 0, liq: 0, vol: 0, tx: 0 }
  v.pairs++
  v.liq += m.liq
  v.vol += m.vol
  v.tx += m.tx
  byVenue.set(m.dex, v)
}
const money = (n) => "$" + Math.round(n).toLocaleString("en-US")
console.log("\nwho actually trades, by venue:")
for (const [dex, v] of [...byVenue.entries()].sort((a, b) => b[1].vol - a[1].vol)) {
  console.log(
    `  ${(dex || "unknown").padEnd(11)} pairs=${String(v.pairs).padStart(3)}` +
      `  liquidity=${money(v.liq).padStart(11)}  24h volume=${money(v.vol).padStart(11)}` +
      `  24h trades=${String(v.tx).padStart(5)}`
  )
}

console.log(`\n${routable} of ${ranked.length} route in-app\n`)
for (const [why, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${why}`)
}
rmSync(outDir, { recursive: true, force: true })
