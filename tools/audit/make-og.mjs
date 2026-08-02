import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const OUT = process.argv[3] || "../../public/og.png"

/* Renders the social card from the live hero rather than mocking one up, so it
   cannot drift from the site. 1200x630 is the size every unfurler crops to.
   The pointer is parked off-canvas so the aperture resolves the whole headline
   instead of veiling most of it — the effect is for readers, not for a static
   thumbnail. */
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 })
/* `domcontentloaded`, not `networkidle2` — the landing page polls stats every
   eight seconds and the tape every forty-five, so the network never goes idle
   and the wait times out. */
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 })
await wait(5000)
await p.evaluate(() => {
  document.documentElement.classList.remove("aperture-on", "reticle-on")
  document.querySelectorAll(".ap-scrim, .aperture-rule").forEach((n) => n.remove())
  // The header would read as chrome in a thumbnail.
  document.querySelector("header")?.remove()

  /* Strip the live counters. A social card is a static file that outlives the
     numbers printed on it, and this project's own rule is that no figure may
     appear which cannot be reproduced from a live call — a frozen "653 launches
     in the last hour" baked into a shared image is exactly that. */
  for (const el of document.querySelectorAll("p, div, span")) {
    if (/launches indexed in the last hour/i.test(el.textContent || "")) {
      const row = el.closest("p, div")
      if (row && (row.textContent || "").length < 120) {
        row.remove()
        break
      }
    }
  }
})
await wait(600)
await p.screenshot({ path: OUT })
console.log("wrote", OUT)
await b.close()
