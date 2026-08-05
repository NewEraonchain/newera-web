import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const ok = (n, p, extra = "") => console.log(`${p ? "PASS" : "FAIL"}  ${n}${extra ? "  — " + extra : ""}`)

const live = await (await fetch("https://newerabackend-production.up.railway.app/intel/stats")).json()
console.log(`live stats: duplicatePct=${live.duplicatePct}  highRiskPct=${live.highRiskPct}\n`)

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const text = async (route) => {
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.goto(`http://localhost:${PORT}${route}`, { waitUntil: "networkidle2", timeout: 60000 })
  await wait(3500)
  const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "))
  const links = await p.evaluate(() =>
    [...document.querySelectorAll("main a")].map((a) => ({ href: a.getAttribute("href"), t: a.innerText.trim() }))
  )
  await p.close()
  return { t, links }
}

// 1. No frozen statistic survives on any content surface.
const routes = ["/", "/detection", "/how-it-works", "/themes", "/docs", "/risk", "/terms", "/privacy", "/contact", "/app"]
let frozen = []
for (const r of routes) {
  const { t } = await text(r)
  if (/\b69%/.test(t)) frozen.push(`${r}: 69%`)
  if (/70% are effectively|roughly 70%/i.test(t)) frozen.push(`${r}: 70% abandoned`)
  if (/2–3x across four|2-3x across four/i.test(t)) frozen.push(`${r}: 2–3x four samples`)
  if (/[Rr]oughly a third of all launches/.test(t)) frozen.push(`${r}: "a third"`)
}
ok("1 no frozen statistics anywhere", frozen.length === 0, frozen.join(" | ") || "clean")

// 2. The live duplicate figure (on /about) matches the API.
{
  const { t } = await text("/about")
  // Wording tracks the backend's actual definition: `duplicatePct` counts any
  // deception flag, not near-copies alone.
  const m = t.match(/Right now (\d+(?:\.\d+)?)% of launches carry a duplicate or impersonation flag/)
  ok("2 /about quotes the live figure", !!m && Math.abs(Number(m[1]) - live.duplicatePct) < 1.5, m ? `page=${m[1]}% api=${live.duplicatePct}%` : "sentence not found")
}

// 3. No market-timing / advice language.
{
  let advice = []
  for (const r of ["/", "/detection", "/themes", "/how-it-works", "/app"]) {
    const { t } = await text(r)
    for (const phrase of ["move has happened", "has mostly happened", "still an edge", "worth acting on", "promoted as opportunities"]) {
      if (t.toLowerCase().includes(phrase)) advice.push(`${r}: "${phrase}"`)
    }
  }
  ok("3 no market-timing language", advice.length === 0, advice.join(" | ") || "clean")
}

// 4. /contact promises nothing that isn't there, and the handle is a real link.
{
  const { t, links } = await text("/contact")
  ok("4a no promise of an absent address", !/address below/i.test(t) && !/within one month/i.test(t))
  ok("4b the X handle is a link", links.some((l) => /x\.com/.test(l.href || "")), JSON.stringify(links.map((l) => l.href)))
}

// 5. /privacy no longer promises an email channel.
{
  const { t } = await text("/privacy")
  ok("5 privacy promises only what exists", !/by email are answered/i.test(t))
}

// 6. Docs name the real controls and print the base URL.
{
  const { t } = await text("/docs")
  ok("6a docs describe the real UI", !/Organic themes only/i.test(t) && !/left panel/i.test(t))
  ok("6b docs print the API base URL", /https:\/\/newerabackend-production\.up\.railway\.app/.test(t))
}

// 7. Onboarding no longer claims personalisation or existing alerts.
{
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.goto(`http://localhost:${PORT}/app`, { waitUntil: "networkidle2", timeout: 60000 })
  await p.evaluate(() => localStorage.clear())
  await p.reload({ waitUntil: "networkidle2" })
  await wait(2500)
  await p.evaluate(() => {
    const el = [...document.querySelectorAll("header button, header a")].find((n) => /get started/i.test(n.innerText || ""))
    el?.click()
  })
  await wait(1200)
  const t = await p.evaluate(() => document.querySelector('[role="dialog"]')?.innerText.replace(/\s+/g, " ") || "")
  ok("7 intent promise is truthful", !/puts in front of you first/i.test(t), t.slice(0, 80))
  await p.close()
}

// 8. Nothing promises a watchlist or alerts. Neither exists; /account says so.
{
  const bad = []
  for (const r of ["/", "/about", "/how-it-works", "/docs", "/detection"]) {
    const { t } = await text(r)
    if (/watchlist|set alerts/i.test(t)) bad.push(r)
  }
  ok("8 no page sells a watchlist or alerts", bad.length === 0, bad.join(" ") || "clean")
}

/* 9 and 10 read the DEPLOYED backend, not the working copy.
 *
 * They will keep failing after the fix lands in `newera-api` and before it is
 * deployed, which is the correct reading: the claims on the site are about what
 * the live index returns, and until the deploy the live index still returns
 * single-launch themes and blanket EMERGING. */

// 9. The clusters the index returns are clusters, and EMERGING means something.
{
  const themes = await (
    await fetch("https://newerabackend-production.up.railway.app/intel/themes?limit=100")
  ).json()
  const items = themes.items || []
  const singles = items.filter((t) => t.launchCount < 2)
  ok("9a no single-launch theme is returned as a cluster", singles.length === 0, `${singles.length} of ${items.length}`)

  /* The site states, in these words, that EMERGING is "the only state where
     independent wallets are still arriving". It was true of 23 of the 100
     clusters carrying the label. */
  const emerging = items.filter((t) => t.status === "EMERGING")
  const solo = emerging.filter((t) => t.creatorCount < 2)
  ok("9b every EMERGING cluster has independent wallets", solo.length === 0, `${solo.length} solo of ${emerging.length} EMERGING`)

  /* A status that is the same on every row carries no information. This is the
     check that would have caught it: 100 of 100 were EMERGING. */
  const spread = new Set(items.map((t) => t.status)).size
  ok("9c the status field distinguishes clusters", items.length < 5 || spread > 1, `${spread} distinct states across ${items.length}`)
}

// 10. A deployer's record exists for the wallets the app links to.
{
  const feed = await (
    await fetch("https://newerabackend-production.up.railway.app/intel/feed?limit=8")
  ).json()
  const wallets = [...new Set((feed.items || []).map((l) => l.creator))].slice(0, 6)
  let missing = 0
  for (const w of wallets) {
    const r = await (
      await fetch(`https://newerabackend-production.up.railway.app/intel/creators/${w}`)
    ).json()
    if (!r.profile) missing++
  }
  /* "See their record →" led to a page with no record on it for six wallets in
     seven, because the watcher's refresh only reaches 500 of ~3,500 daily
     creators. The record is folded from their launches when there is no stored
     row, so a gap in our refresh cycle is no longer reported as a fact about
     the wallet. */
  ok("10 every linked deployer has a record", missing === 0, `${missing} of ${wallets.length} without`)
}

// 11. /detection shows no figure it cannot measure right now.
{
  const { t } = await text("/detection")
  const sep = await (
    await fetch("https://newerabackend-production.up.railway.app/intel/separation")
  ).json()
  /* The recorded fallback pair was 56.0/13.3 — a 4.2x ratio against a live
     3.08x — rendered in the same type as the live reading whenever the index
     could not be reached, on the page arguing that a frozen number stops being
     evidence. */
  ok("11a no recorded fallback figure is printed", !/56\.0%|13\.3%/.test(t))
  if (sep?.conclusive) {
    ok("11b the printed separation is the live one", t.includes(`${sep.lift.toFixed(1)}x separation`), `expected ${sep.lift.toFixed(1)}x`)
    ok("11c the sample size is stated", t.includes(sep.sampleSize.toLocaleString("en-US")))
  } else {
    ok("11b the page says it cannot measure it", /not available right now/i.test(t))
  }
}

await b.close()
