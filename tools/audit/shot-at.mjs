import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const [PORT, TARGET, NAME] = [process.argv[2] || "5173", Number(process.argv[3] || 2200), process.argv[4] || "shot"]
const ROUTE = process.argv[5] || "/"

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
await p.goto(`http://localhost:${PORT}${ROUTE}`, { waitUntil: "networkidle2", timeout: 90000 })
await wait(3000)
await p.mouse.move(720, 450)
let cur = 0
while (cur < TARGET) { await p.mouse.wheel({ deltaY: 100 }); cur += 100; await wait(14) }
await wait(1200)
await p.screenshot({ path: `../shots/${NAME}.png` })
await b.close()
