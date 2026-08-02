import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const [PORT, SEL, NAME] = [process.argv[2], process.argv[3], process.argv[4]]

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2", timeout: 90000 })
await wait(3500)
await p.mouse.move(720, 300)
const el = await p.$(SEL)
if (!el) { console.log("no match for", SEL); await b.close(); process.exit(1) }
await p.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "center" }), SEL)
await wait(1200)
await el.screenshot({ path: `../shots/${NAME}.png` })
console.log("cropped", SEL)
await b.close()
