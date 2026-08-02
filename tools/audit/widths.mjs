import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const WIDTHS = [390, 768, 1024, 1440, 1920]

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })

const probe = async (p, label) => {
  const r = await p.evaluate(() => {
    const de = document.documentElement
    // Any kinetic line wider than the box it sits in?
    const over = []
    for (const el of document.querySelectorAll("h1,h2")) {
      for (const line of el.children) {
        if (!(line instanceof HTMLElement)) continue
        if (getComputedStyle(line).whiteSpace !== "nowrap") continue
        const lw = line.getBoundingClientRect().width
        const pw = el.getBoundingClientRect().width
        if (lw > pw + 2)
          over.push({ txt: (line.textContent || "").slice(0, 30), lineW: Math.round(lw), boxW: Math.round(pw) })
      }
    }
    return {
      hScroll: de.scrollWidth - de.clientWidth,
      overflowing: over.slice(0, 4),
      lines: document.querySelectorAll('h1 > [style*="nowrap"], h2 > [style*="nowrap"]').length,
    }
  })
  console.log(label.padEnd(26), "h-overflow", String(r.hScroll).padEnd(5), "nowrap-lines", String(r.lines).padEnd(4), r.overflowing.length ? "OVERFLOW " + JSON.stringify(r.overflowing) : "ok")
}

for (const w of WIDTHS) {
  const p = await b.newPage()
  await p.setViewport({ width: w, height: 900 })
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2", timeout: 60000 })
  await wait(3000)
  await probe(p, `${w}px fresh load`)
  await p.close()
}

// The harder case: load wide, then resize narrow, so the split must re-run.
const p = await b.newPage()
await p.setViewport({ width: 1920, height: 900 })
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2", timeout: 60000 })
await wait(3000)
for (const w of [1024, 768, 390]) {
  await p.setViewport({ width: w, height: 900 })
  await wait(1500)
  await probe(p, `resized 1920 -> ${w}`)
}
await p.close()
await b.close()
