import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
await p.goto(`http://localhost:${PORT}/app`, { waitUntil: "networkidle2", timeout: 60000 })
await p.evaluate(() => localStorage.clear())
await p.reload({ waitUntil: "networkidle2" })
await wait(2500)

const read = () =>
  p.evaluate(() => {
    const r = document.querySelector('[aria-hidden="true"].fixed.left-0.top-0')
    if (!r) return { error: "reticle not found" }
    const s = getComputedStyle(r)
    const m = new DOMMatrixReadOnly(s.transform)
    const dlg = document.querySelector('[role="dialog"]')
    const ov = [...document.querySelectorAll("div")].find((d) =>
      /fixed inset-0 z-\[100\]/.test(d.className || "")
    )
    return {
      opacity: s.opacity,
      z: s.zIndex,
      x: Math.round(m.m41),
      y: Math.round(m.m42),
      dialogOpen: !!dlg,
      dialogZ: dlg ? getComputedStyle(dlg).zIndex : null,
      overlayZ: ov ? getComputedStyle(ov).zIndex : null,
      bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
      cursorHidden: getComputedStyle(document.body).cursor === "none",
    }
  })

// Move around with no dialog.
await p.mouse.move(400, 300)
await wait(600)
await p.mouse.move(500, 380)
await wait(700)
console.log("no dialog: ", JSON.stringify(await read()))

// Open onboarding from the header control.
await p.evaluate(() => {
  const el = [...document.querySelectorAll("header button, header a")].find((n) =>
    /get started/i.test(n.innerText || "")
  )
  el?.click()
})
await wait(1000)
await p.mouse.move(700, 450)
await wait(500)
const a = await read()
await p.mouse.move(820, 560)
await wait(700)
const bb = await read()

console.log("dialog open A:", JSON.stringify(a))
console.log("dialog open B:", JSON.stringify(bb))
console.log()
console.log("reticle visible over dialog:", a.opacity === "1" ? "PASS" : `FAIL (opacity ${a.opacity})`)
console.log(
  "reticle above dialog:      ",
  Number(a.z) > Number(a.dialogZ || 0) ? `PASS (${a.z} > ${a.dialogZ})` : `FAIL (${a.z} vs ${a.dialogZ})`
)
console.log(
  "reticle still tracks:      ",
  bb.x !== a.x || bb.y !== a.y ? `PASS (${a.x},${a.y} -> ${bb.x},${bb.y})` : `FAIL (stuck at ${a.x},${a.y})`
)
await p.screenshot({ path: "../shots/reticle-modal.png" })
await b.close()
