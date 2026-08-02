import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2", timeout: 90000 })
await wait(3000)
await p.mouse.move(720, 450)

const marks = [1200, 1600, 1900, 2200, 2600, 3000, 3400, 4200, 5200]
const out = []
let cur = 0
for (const target of marks) {
  while (cur < target) {
    await p.mouse.wheel({ deltaY: 100 })
    cur += 100
    await wait(14)
  }
  await wait(700)
  out.push(
    await p.evaluate(() => {
      const at = (x, y) => {
        const e = document.elementFromPoint(x, y)
        let s = e
        while (s && s.tagName !== "SECTION" && s.tagName !== "FOOTER") s = s.parentElement
        return (s?.innerText || e?.innerText || "").replace(/\s+/g, " ").slice(0, 54)
      }
      return { y: Math.round(window.scrollY), center: at(720, 450), top: at(720, 120), bottom: at(720, 800) }
    })
  )
}
console.log(JSON.stringify(out, null, 2))
await b.close()
