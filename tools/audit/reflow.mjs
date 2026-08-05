/* WCAG 2.2 Reflow (1.4.10): no horizontal scrolling at 320 CSS px.
 * That is a 1280px window at 400% zoom, which is the actual reason the
 * criterion exists — it is not a phone check. */
import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const PORT = process.argv[2] || "5173"
const ROUTES = ["/", "/app", "/app/theme/tread-fi", "/about", "/docs", "/detection", "/how-it-works", "/account", "/terms", "/privacy", "/risk", "/contact"]
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
let bad = 0
for (const route of ROUTES) {
  const p = await b.newPage()
  await p.setViewport({ width: 320, height: 800 })
  await p.goto(`http://localhost:${PORT}${route}`, { waitUntil: "networkidle2" }).catch(() => {})
  const r = await p.evaluate(() => {
    const de = document.documentElement
    /* Does it actually SCROLL, not merely overflow. `overflow-x: hidden` on
       body propagates to the viewport, so a page can report scrollWidth wider
       than clientWidth — a marquee does this by design — while being unable to
       move a pixel. The criterion is about the reader having to scroll, so ask
       the question that way. */
    window.scrollTo(9999, window.scrollY)
    const moved = window.scrollX
    window.scrollTo(0, window.scrollY)
    const over = moved > 0 ? de.scrollWidth - de.clientWidth : 0
    const culprits = []
    if (over > 0) {
      for (const el of document.querySelectorAll("*")) {
        const b = el.getBoundingClientRect()
        if (b.width === 0) continue
        if (b.right > de.clientWidth + 1 || b.left < -1) {
          culprits.push(`${el.tagName}.${String(el.className).slice(0, 60)} [${Math.round(b.left)}..${Math.round(b.right)}]`)
        }
      }
    }
    return { over, culprits: culprits.slice(0, 4) }
  })
  await p.close()
  if (r.over > 0) bad++
  console.log(`${route.padEnd(20)} ${r.over > 0 ? `OVERFLOWS BY ${r.over}px` : "ok"}`)
  r.culprits.forEach((c) => console.log(`    ${c}`))
}
await b.close()
console.log(bad ? `\n${bad} routes scroll sideways at 320px` : "\nno route scrolls sideways at 320px")
