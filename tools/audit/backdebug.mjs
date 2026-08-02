import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
const dump = async (label) =>
  console.log(
    label,
    JSON.stringify(
      await p.evaluate(() => ({
        y: Math.round(window.scrollY),
        path: location.pathname,
        docH: document.documentElement.scrollHeight,
        store: Object.fromEntries(
          Object.entries(sessionStorage).filter(([k]) => k.startsWith("newera:scroll:"))
        ),
      }))
    )
  )

await p.goto(`http://localhost:${PORT}/app`, { waitUntil: "networkidle2", timeout: 60000 })
await p.evaluate(() => localStorage.setItem("newera_onboard_declined", String(Date.now())))
await p.reload({ waitUntil: "networkidle2" })
await wait(4000)
await p.mouse.move(700, 450)
for (let i = 0; i < 22; i++) { await p.mouse.wheel({ deltaY: 120 }); await wait(16) }
await wait(1200)
await dump("before click ")

await p.evaluate(() => document.querySelector('a[href^="/app/theme/"]')?.click())
await wait(3000)
await dump("on detail   ")

await p.goBack({ waitUntil: "networkidle2" })
await wait(600)
await dump("back +0.6s  ")
await wait(4000)
await dump("back +4.6s  ")
await b.close()
