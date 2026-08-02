import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const ROUTES = ["/", "/app", "/how-it-works", "/detection", "/themes", "/docs", "/about", "/account"]

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })

for (const route of ROUTES) {
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.evaluateOnNewDocument(() => {
    window.__shifts = []
    window.__long = []
    window.__frames = []
    let last = performance.now()
    const tick = (t) => { window.__frames.push(t - last); last = t; requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    const name = (n) => {
      if (!n || n.nodeType !== 1) return "?"
      const cls = String(n.className || "").split(/\s+/).filter(Boolean).slice(0, 2).join(".")
      return n.tagName.toLowerCase() + (cls ? "." + cls : "")
    }
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        window.__shifts.push({ v: +e.value.toFixed(4), src: (e.sources || []).map((s) => name(s.node)) })
    }).observe({ type: "layout-shift", buffered: true })
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__long.push(Math.round(e.duration))
    }).observe({ type: "longtask", buffered: true })
  })

  try {
    await p.goto(`http://localhost:${PORT}${route}`, { waitUntil: "networkidle2", timeout: 60000 })
  } catch { /* keep going; report what we can */ }
  await wait(3500)
  const h = await p.evaluate(() => document.documentElement.scrollHeight)
  await p.evaluate(() => { window.__shifts.length = 0; window.__long.length = 0; window.__frames.length = 0 })

  await p.mouse.move(720, 450)
  const steps = Math.min(90, Math.max(12, Math.ceil(h / 140)))
  for (let i = 0; i < steps; i++) { await p.mouse.wheel({ deltaY: 120 }); await wait(16) }
  await wait(900)

  const r = await p.evaluate(() => {
    const f = window.__frames.filter((x) => x < 1000) // drop idle-throttle gaps
    const s = [...f].sort((a, b) => a - b)
    const shifts = window.__shifts
    const big = shifts.filter((x) => x.v > 0.02)
    return {
      cls: +shifts.reduce((a, x) => a + x.v, 0).toFixed(3),
      n: shifts.length,
      big: big.slice(0, 4).map((x) => x.v + " " + x.src.join(",")),
      p95: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(1),
      over32: f.filter((x) => x > 32).length,
      long: window.__long.filter((d) => d > 50),
    }
  })
  console.log(
    route.padEnd(15),
    `${h}px`.padEnd(9),
    "CLS", String(r.cls).padEnd(7),
    "shifts", String(r.n).padEnd(5),
    "p95", String(r.p95).padEnd(6),
    ">32ms", String(r.over32).padEnd(4),
    "long", JSON.stringify(r.long)
  )
  if (r.big.length) console.log("   ".padEnd(16), r.big.join("  |  "))
  await p.close()
}
await b.close()
