import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const route = process.argv[2] || "/"
const PORT = process.argv[3] || "5173"

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })

/* Instrument before any app code runs: frame deltas, layout shifts with their
   source elements, and forced-reflow-ish long tasks. */
await p.evaluateOnNewDocument(() => {
  window.__frames = []
  window.__shifts = []
  window.__long = []
  let last = performance.now()
  const tick = (t) => {
    window.__frames.push(+(t - last).toFixed(1))
    last = t
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  const name = (n) => {
    if (!n || n.nodeType !== 1) return "?"
    const cls = String(n.className || "").split(/\s+/).filter(Boolean).slice(0, 3).join(".")
    return n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + (cls ? "." + cls : "")
  }
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      window.__shifts.push({
        v: +e.value.toFixed(4),
        t: Math.round(e.startTime),
        input: e.hadRecentInput,
        src: (e.sources || []).map((s) => ({
          el: name(s.node),
          txt: (s.node?.innerText || "").replace(/\s+/g, " ").slice(0, 46),
          from: [Math.round(s.previousRect.x), Math.round(s.previousRect.y), Math.round(s.previousRect.width), Math.round(s.previousRect.height)],
          to: [Math.round(s.currentRect.x), Math.round(s.currentRect.y), Math.round(s.currentRect.width), Math.round(s.currentRect.height)],
        })),
      })
    }
  }).observe({ type: "layout-shift", buffered: true })

  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__long.push({ t: Math.round(e.startTime), dur: Math.round(e.duration) })
  }).observe({ type: "longtask", buffered: true })
})

await p.goto(`http://localhost:${PORT}${route}`, { waitUntil: "networkidle2", timeout: 90000 })
await wait(3500) // let entrances settle

const height = await p.evaluate(() => document.documentElement.scrollHeight)
await p.evaluate(() => {
  window.__frames.length = 0
  window.__shifts.length = 0
  window.__long.length = 0
})

// Real wheel events, so Lenis handles them the way it does for a person.
await p.mouse.move(720, 450)
const STEPS = Math.min(140, Math.ceil(height / 100))
for (let i = 0; i < STEPS; i++) {
  await p.mouse.wheel({ deltaY: 100 })
  await wait(16)
}
await wait(1800)

const r = await p.evaluate(() => {
  const f = window.__frames
  const sorted = [...f].sort((a, b) => a - b)
  return {
    frames: f.length,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    max: sorted[sorted.length - 1],
    over32: f.filter((x) => x > 32).length,
    over50: f.filter((x) => x > 50).length,
    longtasks: window.__long.filter((l) => l.dur > 50),
    shiftTotal: +window.__shifts.reduce((a, s) => a + s.v, 0).toFixed(3),
    shiftCount: window.__shifts.length,
    worstShifts: window.__shifts.sort((a, b) => b.v - a.v).slice(0, 8),
    scrollY: Math.round(window.scrollY),
    docH: document.documentElement.scrollHeight,
  }
})
console.log(route, "@", height + "px")
console.log(JSON.stringify(r, null, 2))
await b.close()
