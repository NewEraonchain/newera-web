import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const ROUTES = ["/", "/app", "/how-it-works", "/about"]

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
for (const route of ROUTES) {
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.goto(`http://localhost:${PORT}${route}`, { waitUntil: "networkidle2", timeout: 60000 })
  await wait(3000)

  // Watch every display element's width axis for the whole scroll.
  await p.evaluate(() => {
    window.__seen = new Map()
    const s = () => {
      for (const el of document.querySelectorAll("h1,h2,h3,h1 span,h2 span,[data-line]")) {
        const fs = getComputedStyle(el).fontStretch
        const k = el.tagName + ":" + (el.textContent || "").trim().slice(0, 22)
        if (!window.__seen.has(k)) window.__seen.set(k, new Set())
        window.__seen.get(k).add(fs)
      }
      requestAnimationFrame(s)
    }
    requestAnimationFrame(s)
  })

  await p.mouse.move(720, 450)
  for (let i = 0; i < 60; i++) { await p.mouse.wheel({ deltaY: 320 }); await wait(16) }
  await wait(1200)

  const moving = await p.evaluate(() =>
    [...window.__seen.entries()]
      .filter(([, v]) => v.size > 1)
      .map(([k, v]) => ({ el: k, widths: [...v] }))
      .slice(0, 6)
  )
  console.log(route.padEnd(16), moving.length ? "STRETCHING: " + JSON.stringify(moving) : "no width-axis movement")
  await p.close()
}
await b.close()
