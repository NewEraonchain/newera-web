import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const MARKS = process.argv.slice(3).map(Number)

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2", timeout: 90000 })
await wait(3200)
await p.mouse.move(720, 450)

for (const target of MARKS) {
  // Drive by real scroll position, not by wheel count — the pin absorbs a
  // stretch of scrolling without the page moving under it.
  let guard = 0
  while ((await p.evaluate(() => window.scrollY)) < target && guard++ < 900) {
    await p.mouse.wheel({ deltaY: 120 })
    await wait(14)
  }
  await wait(900)
  const y = await p.evaluate(() => Math.round(window.scrollY))
  await p.screenshot({ path: `../shots/film-${target}.png` })
  console.log("captured", target, "actual scrollY", y)
}
await b.close()
