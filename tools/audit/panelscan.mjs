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

const out = await p.evaluate(async () => {
  const panels = [...document.querySelectorAll(".stack-panel")]
  const worst = panels.map(() => ({ sideGap: 0, topGap: 0, scale: 1, y: 0 }))
  const seams = []

  const sample = () => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    panels.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      // Is any part of this panel on screen at all?
      if (r.bottom < 0 || r.top > vh) return
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform)
      const scale = +m.a.toFixed(3)
      // A scaled panel pulls away from the viewport's left/right edges and
      // exposes whatever is behind it as a vertical bar down each side.
      const sideGap = Math.round(Math.max(r.left, 0))
      if (sideGap > worst[i].sideGap)
        worst[i] = { sideGap, topGap: Math.round(Math.max(0, r.top)), scale, y: Math.round(window.scrollY) }
    })

    // Vertical seams: a horizontal band of the viewport covered by no panel,
    // between two panels that are both on screen.
    const on = panels
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.bottom > 0 && r.top < vh)
      .sort((a, c) => a.top - c.top)
    for (let i = 1; i < on.length; i++) {
      const gap = Math.round(on[i].top - on[i - 1].bottom)
      if (gap > 2) seams.push({ y: Math.round(window.scrollY), gap })
    }
  }

  for (let i = 0; i < 130; i++) {
    sample()
    window.scrollBy(0, 95)
    await new Promise((r) => setTimeout(r, 45))
  }
  return { worst, seams: seams.slice(0, 10), seamCount: seams.length }
})

console.log(JSON.stringify(out, null, 2))
await b.close()
