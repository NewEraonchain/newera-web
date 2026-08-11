/* What the token page ACTUALLY shows, in a real browser.
 *
 * The same routing code gives different answers under Node and in the page:
 * recovering a v4 pool key needs a wide `getLogs` sweep, and the browser makes
 * that call over the public RPC with the page's own concurrency and timeouts.
 * A route that resolves in a script and hands off in the tab is exactly the
 * failure a user reports as "why does it say trade on Uniswap". */
import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const PORT = process.argv[2] || "5173"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
await p.goto(`http://localhost:${PORT}/app`, { waitUntil: "networkidle2" })
await wait(4000)
const hrefs = await p.evaluate(() => {
  const h = [...document.querySelectorAll("h2")].find((x) => /getting traded/i.test(x.textContent || ""))
  const s = h?.closest("section") || document
  return [...new Set([...s.querySelectorAll('a[href*="/app/token/"]')].map((a) => a.getAttribute("href")))]
})
await p.close()
console.log(`${hrefs.length} tradeable tokens listed on the feed\n`)

let panel = 0
const handoff = []
for (const href of hrefs) {
  const t = await b.newPage()
  await t.setViewport({ width: 1440, height: 900 })
  const rpcFails = []
  t.on("requestfailed", (r) => { if (/rpc/.test(r.url())) rpcFails.push(r.failure()?.errorText) })
  await t.goto(`http://localhost:${PORT}${href}`, { waitUntil: "networkidle2" }).catch(() => {})
  await wait(6000)
  const r = await t.evaluate(() => {
    const txt = document.body.innerText
    /* Both headings and both call-to-action wordings. The panel says "Trading
       this one happens elsewhere" when a venue we do not route holds the market,
       and "This one cannot be traded right now" when the pool is empty — and the
       second one offers "See the pool on X", not "Trade on X", precisely because
       sending somebody to trade an empty pool is not an offer. This matcher knew
       only the first pair and reported the second as a handoff with a null
       reason, which read as a page failing to explain itself when the page was
       explaining itself perfectly. */
    const cta = [...document.querySelectorAll("a")].find((a) =>
      /^(Trade on|See the pool on) /i.test(a.innerText.trim())
    )
    const head = [...document.querySelectorAll("h2")].find((h) =>
      /happens elsewhere|cannot be traded right now/i.test(h.textContent || "")
    )
    const reason = head?.nextElementSibling?.textContent?.trim() || null
    return {
      symbol: (document.querySelector("h1")?.innerText || "").slice(0, 14),
      routes: /Buy/.test(txt) && !!document.querySelector("[aria-pressed]"),
      cta: cta?.innerText.trim() || null,
      reason,
    }
  })
  await t.close()
  if (r.routes) { panel++; continue }
  handoff.push({ ...r, href, rpcFails: rpcFails.length })
  console.log(`  ${r.symbol.padEnd(14)} → ${r.cta}\n      ${r.reason}${r.rpcFails ? `\n      (${r.rpcFails} RPC requests failed)` : ""}`)
}
await b.close()
console.log(`\n${panel} of ${hrefs.length} show the trade panel; ${handoff.length} hand off`)
