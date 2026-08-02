import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2", timeout: 90000 })
await wait(2500)

// Sample the header's block height every frame for 22s — more than two polls.
const out = await p.evaluate(async () => {
  const el = document.querySelector("header .tabular-nums")
  if (!el) return { error: "no block-height element found in header" }
  const seen = new Set()
  const bad = []
  const t0 = performance.now()
  while (performance.now() - t0 < 22000) {
    const v = (el.textContent || "").trim()
    if (v && !seen.has(v)) {
      seen.add(v)
      // A well-formed grouped number: 1-3 digits then groups of exactly 3.
      if (!/^\d{1,3}(,\d{3})*$/.test(v)) bad.push(v)
    }
    await new Promise((r) => requestAnimationFrame(r))
  }
  return { distinct: [...seen].slice(0, 8), distinctCount: seen.size, malformed: bad.slice(0, 10), malformedCount: bad.length }
})
console.log(JSON.stringify(out, null, 2))
await b.close()
