import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const ROUTES = ["/", "/app", "/how-it-works", "/detection", "/themes", "/docs", "/about", "/account"]

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
for (const route of ROUTES) {
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.goto(`http://localhost:${PORT}${route}`, { waitUntil: "networkidle2", timeout: 60000 })
  await wait(2500)
  await p.mouse.move(720, 450)

  // Walk the whole page the way a reader does, then look for anything that
  // was revealed on the way down and never actually arrived.
  const found = await p.evaluate(async () => {
    const bad = new Map()
    const check = () => {
      for (const el of document.querySelectorAll("h1,h2,h3,h4,p,li,a,span,div,section,button")) {
        const r = el.getBoundingClientRect()
        if (r.width < 8 || r.height < 8) continue
        if (r.bottom < 0 || r.top > window.innerHeight) continue
        if (!(el.textContent || "").trim()) continue
        const s = getComputedStyle(el)
        const op = parseFloat(s.opacity)
        const clipped = /inset\(\s*(100%|9\d(\.\d+)?%)/.test(s.clipPath)
        const yOff = new DOMMatrixReadOnly(s.transform).m42
        if (op < 0.05 || clipped || Math.abs(yOff) > 220) {
          const key = (el.tagName + "." + String(el.className || "").split(/\s+/).slice(0, 2).join(".")).slice(0, 60)
          if (!bad.has(key))
            bad.set(key, {
              key,
              opacity: +op.toFixed(2),
              clip: clipped ? s.clipPath : null,
              yOff: Math.round(yOff),
              txt: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
            })
        }
      }
    }
    for (let i = 0; i < 70; i++) {
      window.scrollBy(0, 180)
      await new Promise((r) => setTimeout(r, 60))
      check()
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) break
    }
    // Settle, then look once more: anything still hidden here is stuck.
    await new Promise((r) => setTimeout(r, 1400))
    const stuck = []
    bad.clear()
    check()
    for (const v of bad.values()) stuck.push(v)
    return stuck
  })

  console.log(route.padEnd(15), found.length ? JSON.stringify(found.slice(0, 5)) : "clean")
  await p.close()
}
await b.close()
