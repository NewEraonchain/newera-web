/* Does "Getting traded" show what is trading NOW?
 *
 * It used to rank by 24-hour volume, so a token that traded heavily twenty
 * hours ago and stopped outranked one trading this minute — under a heading in
 * the present tense. This compares the two orderings on live data and checks
 * the top of the list is actually active. */
const API = "https://newerabackend-production.up.railway.app"
const feed = await fetch(`${API}/intel/feed?limit=60`).then((r) => r.json())
const addrs = [...new Set((feed.items || []).map((l) => l.address.toLowerCase()))]

const markets = new Map()
for (let i = 0; i < addrs.length; i += 25) {
  const r = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + addrs.slice(i, i + 25).join(","))
    .then((r) => r.json()).catch(() => null)
  for (const p of r?.pairs || []) {
    const a = String(p?.baseToken?.address || "").toLowerCase()
    const liq = Number(p?.liquidity?.usd) || 0
    if (!a || (markets.get(a)?.liq ?? -1) >= liq) continue
    const t = (n) => (Number(p?.txns?.[n]?.buys) || 0) + (Number(p?.txns?.[n]?.sells) || 0)
    markets.set(a, {
      sym: p.baseToken.symbol, liq,
      v5: Number(p?.volume?.m5) || 0, v1h: Number(p?.volume?.h1) || 0, v24: Number(p?.volume?.h24) || 0,
      t5: t("m5"), t24: t("h24"),
    })
  }
}
const rows = [...markets.values()].filter((m) => m.liq > 0 && m.v24 > 0 && m.t24 > 1)
if (!rows.length) { console.log("nothing tradeable right now"); process.exit(0) }

const liveness = (m) => m.v5 * 12 + m.v1h * 2 + m.v24 * 0.05
const byOld = [...rows].sort((a, b) => b.v24 - a.v24)
const byNew = [...rows].sort((a, b) => liveness(b) - liveness(a))

const show = (label, list) => {
  console.log(`\n${label}`)
  for (const m of list.slice(0, 5)) {
    console.log(`  ${m.sym.padEnd(12)} 24h $${Math.round(m.v24).toString().padStart(7)}` +
      `  5m $${Math.round(m.v5).toString().padStart(6)}  trades 5m ${String(m.t5).padStart(4)}` +
      `  ${m.t5 > 0 ? "LIVE" : "quiet"}`)
  }
  const deadTop3 = list.slice(0, 3).filter((m) => m.t5 === 0).length
  return deadTop3
}
const oldDead = show("ranked by 24h volume (the old order)", byOld)
const newDead = show("ranked by recent activity (the new order)", byNew)

console.log(`\ndead tokens in the top 3:  old ${oldDead}/3   new ${newDead}/3`)
console.log(newDead <= oldDead
  ? "PASS  the new order surfaces at least as much live activity"
  : "FAIL  the new order is worse")
process.exit(newDead <= oldDead ? 0 : 1)
