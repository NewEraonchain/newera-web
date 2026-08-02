import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2", timeout: 90000 })
await wait(3500)

/* A/B: an !important author rule beats the inline font-stretch the kinetic
   ticker writes, so this freezes the width axis and nothing else. */
if (process.argv.includes("freeze")) {
  await p.evaluate(() => {
    const s = document.createElement("style")
    s.textContent = `* { font-stretch: 72% !important; }`
    document.head.appendChild(s)
  })
  await wait(600)
}

await p.evaluate(() => {
  window.__samples = []
  const panels = [...document.querySelectorAll(".stack-panel")]
  const pinned = [...document.querySelectorAll("section")].find((s) =>
    /FOUR STAGES/i.test(s.innerText || "")
  )
  window.__pinned = pinned
  const sample = () => {
    window.__samples.push({
      y: Math.round(window.scrollY),
      doc: document.documentElement.scrollHeight,
      pin: pinned
        ? {
            pos: getComputedStyle(pinned).position,
            h: pinned.offsetHeight,
            spacer:
              pinned.parentElement?.classList.contains("pin-spacer")
                ? pinned.parentElement.offsetHeight
                : null,
          }
        : null,
      panels: panels.map((e) => ({ h: e.offsetHeight, top: e.style.top })),
    })
    requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)
})

await p.mouse.move(720, 450)
for (let i = 0; i < 120; i++) {
  await p.mouse.wheel({ deltaY: 100 })
  await wait(16)
}
await wait(1200)

const out = await p.evaluate(() => {
  const s = window.__samples
  // Where does the document height change, and by how much?
  const docChanges = []
  for (let i = 1; i < s.length; i++) {
    if (s[i].doc !== s[i - 1].doc)
      docChanges.push({ y: s[i].y, from: s[i - 1].doc, to: s[i].doc, d: s[i].doc - s[i - 1].doc })
  }
  // Panel height changes
  const panelChanges = []
  for (let i = 1; i < s.length; i++) {
    s[i].panels.forEach((pn, k) => {
      const prev = s[i - 1].panels[k]
      if (prev && pn.h !== prev.h)
        panelChanges.push({ panel: k, y: s[i].y, from: prev.h, to: pn.h, top: pn.top })
      if (prev && pn.top !== prev.top)
        panelChanges.push({ panel: k, y: s[i].y, topFrom: prev.top, topTo: pn.top })
    })
  }
  const pinChanges = []
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1].pin, c = s[i].pin
    if (a && c && (a.pos !== c.pos || a.h !== c.h || a.spacer !== c.spacer))
      pinChanges.push({ y: c.y, from: a, to: c })
  }
  return {
    samples: s.length,
    docStart: s[0]?.doc,
    docEnd: s[s.length - 1]?.doc,
    docChanges: docChanges.slice(0, 30),
    docChangeCount: docChanges.length,
    panelChangeCount: panelChanges.length,
    panelChanges: panelChanges.slice(0, 30),
    pinChangeCount: pinChanges.length,
    pinChanges: pinChanges.slice(0, 12),
    panelHeights: s[s.length - 1]?.panels,
  }
})
console.log(JSON.stringify(out, null, 2))
await b.close()
