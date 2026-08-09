/* How many JSON-RPC round trips one token page costs.
 *
 * Everything this app reads from the chain arrives in bursts — fee-tier probes,
 * a v4 pool-key recovery, a quote, decimals, balances — and an unbatched
 * transport pays a full round trip to a public node for each one. This counts
 * them on a token that actually routes, because a page whose pool is drained
 * bails before making most of the calls and would flatter any measurement.
 *
 *   node tools/audit/rpc.mjs [port]
 */
import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const PORT = process.argv[2] || "5173"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })

// A token the app itself lists as tradeable, not one picked by hand.
const feedPage = await b.newPage()
await feedPage.setViewport({ width: 1440, height: 900 })
await feedPage.goto(`http://localhost:${PORT}/app`, { waitUntil: "networkidle2" }).catch(() => {})
await wait(4000)
const hrefs = await feedPage.evaluate(() => {
  const h = [...document.querySelectorAll("h2")].find((x) => /getting traded/i.test(x.textContent || ""))
  const s = h?.closest("section") || document
  return [...new Set([...s.querySelectorAll('a[href*="/app/token/"]')].map((a) => a.getAttribute("href")))]
})
await feedPage.close()

let checked = 0
for (const href of hrefs.slice(0, 5)) {
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  let posts = 0
  let calls = 0
  p.on("request", (r) => {
    if (r.method() !== "POST") return
    if (!/rpc|robinhood/i.test(r.url())) return
    posts++
    // A batched POST carries a JSON array; count the calls inside it too.
    try {
      const body = JSON.parse(r.postData() || "{}")
      calls += Array.isArray(body) ? body.length : 1
    } catch {
      calls += 1
    }
  })
  await p.goto(`http://localhost:${PORT}${href}`, { waitUntil: "networkidle2" }).catch(() => {})
  await wait(7000)
  const routes = await p.evaluate(() => document.querySelectorAll("[aria-pressed]").length > 0)
  const sym = await p.evaluate(() => (document.querySelector("h1")?.innerText || "").slice(0, 12))
  await p.close()
  if (!routes) continue
  checked++
  console.log(
    `  ${sym.padEnd(13)} ${String(posts).padStart(3)} POSTs carrying ${String(calls).padStart(3)} calls` +
      (posts ? `  (${(calls / posts).toFixed(1)} per round trip)` : "")
  )
  if (checked >= 3) break
}
if (!checked) console.log("  no routable token on the feed right now — nothing to measure")
await b.close()
