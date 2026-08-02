import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const ok = (n, p, extra = "") => console.log(`${p ? "PASS" : "FAIL"}  ${n}${extra ? "  — " + extra : ""}`)
const API = "https://newerabackend-production.up.railway.app"

const feed = await (await fetch(`${API}/intel/feed?limit=1`)).json()
const stats = await (await fetch(`${API}/intel/stats`)).json()
const dataAge = feed.items[0].ageSeconds
const beat = Math.round((Date.now() - new Date(stats.lastIngestAt).getTime()) / 1000)
console.log(`newest launch ${dataAge}s old; watcher last ran ${beat}s ago\n`)

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
await p.goto(`http://localhost:${PORT}/app`, { waitUntil: "domcontentloaded", timeout: 60000 })
await wait(6000)
const label = await p.evaluate(() => {
  // Case-insensitive: the label is uppercased in CSS, so innerText comes back
  // as "INDEXED THROUGH 10M AGO".
  const el = [...document.querySelectorAll("p")].find((n) =>
    /live|indexed through|indexer offline|connecting|waiting/i.test(n.innerText)
  )
  return el ? el.innerText.replace(/\s+/g, " ").trim() : null
})
console.log(`page says: "${label}"`)

/* The claim must match the data, not the process. "Live" is only honest when
   the newest indexed launch is under two minutes old. */
if (dataAge < 120) {
  ok("claims Live only when data is fresh", /live/i.test(label || ""), `data ${dataAge}s`)
} else {
  ok("does not claim Live over stale data", !/●\s*live/i.test(label || ""), `data ${dataAge}s, label "${label}"`)
  ok("states how far behind it is", /indexed through/i.test(label || ""), label || "")
}
await b.close()
