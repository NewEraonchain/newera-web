import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const ROUTES = ["/", "/how-it-works", "/detection", "/about"]

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })

for (const route of ROUTES) {
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  // Sample from the very first paint, before any of our code runs.
  await p.evaluateOnNewDocument(() => {
    window.__t = []
    const t0 = performance.now()
    const s = () => {
      const h = document.querySelector("h1,h2")
      if (h) {
        const r = h.getBoundingClientRect()
        window.__t.push({
          ms: Math.round(performance.now() - t0),
          top: Math.round(r.top),
          h: Math.round(r.height),
          kids: h.children.length,
          nowrap: [...h.children].filter((c) => getComputedStyle(c).whiteSpace === "nowrap").length,
          doc: document.documentElement.scrollHeight,
        })
      }
      requestAnimationFrame(s)
    }
    requestAnimationFrame(s)
  })
  await p.goto(`http://localhost:${PORT}${route}`, { waitUntil: "networkidle2", timeout: 60000 })
  await wait(4000)

  const out = await p.evaluate(() => {
    const t = window.__t
    const ch = []
    for (let i = 1; i < t.length; i++) {
      const a = t[i - 1], c = t[i]
      if (c.h !== a.h || c.kids !== a.kids || c.doc !== a.doc)
        ch.push(`${c.ms}ms h:${a.h}->${c.h} kids:${a.kids}->${c.kids} nowrap:${c.nowrap} doc:${a.doc}->${c.doc}`)
    }
    return { first: t[0], changes: ch, n: ch.length }
  })
  console.log(route.padEnd(15), `${out.n} heading/doc changes after first paint`)
  for (const c of out.changes.slice(0, 12)) console.log("      ", c)
  await p.close()
}
await b.close()
