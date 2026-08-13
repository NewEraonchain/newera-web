/* Look at /portfolio the way a reader does, at both ends of the range.
 *
 * The wallet is read through the new ?address= view, which is the only way to
 * open this page without a signer — and the reason the feature is worth having
 * beyond testing: a portfolio nobody can look at is not shareable. */
import puppeteer from "puppeteer-core"

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const PORT = process.argv[2] || "5173"
const WALLET = process.argv[3] || "0x0a0256a9166041101c90be87bbebb8242a3ba015"
const OUT = process.argv[4] || "."
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })

for (const [name, w, h] of [["desk", 1440, 900], ["phone", 390, 844]]) {
  const p = await b.newPage()
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
  const errs = []
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 160)))
  p.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 160)))

  await p.goto(`http://localhost:${PORT}/portfolio?address=${WALLET}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  })

  // Balances land in about a second; the reconstruction takes far longer.
  await wait(3000)
  await p.screenshot({ path: `${OUT}/portfolio-${name}-early.png` })

  // Wait for the cost basis, but do not wait forever for a public explorer.
  for (let i = 0; i < 40; i++) {
    const still = await p.evaluate(() =>
      document.body.innerText.includes("reconstructing cost")
    )
    if (!still) break
    await wait(2000)
  }
  await wait(1200)
  await p.screenshot({ path: `${OUT}/portfolio-${name}.png` })

  const r = await p.evaluate(() => {
    const de = document.documentElement
    const overflow = de.scrollWidth - de.clientWidth
    const wide = []
    if (overflow > 1) {
      for (const el of document.querySelectorAll("body *")) {
        const b = el.getBoundingClientRect()
        if (b.width === 0) continue
        if (b.right > de.clientWidth + 1 || b.left < -1) {
          const style = getComputedStyle(el)
          if (style.position === "absolute" || style.overflowX === "auto") continue
          wide.push(`${el.tagName}.${String(el.className).slice(0, 40)} → ${Math.round(b.right)}`)
        }
      }
    }
    const small = [...document.querySelectorAll("button, a")]
      .map((el) => ({ el, b: el.getBoundingClientRect() }))
      .filter(({ b }) => b.width > 0 && b.height > 0 && (b.height < 24 || b.width < 24))
      .map(({ el, b }) => `${el.tagName} "${(el.innerText || el.ariaLabel || "").trim().slice(0, 22)}" ${Math.round(b.width)}×${Math.round(b.height)}`)
    /* The table scrolls inside its own box, so a column falling off its right
       edge never shows up as document overflow — and the column that falls off
       is the one carrying the disclosure control. Measured directly. */
    const table = document.querySelector("table")
    const wrap = table?.parentElement
    const clipped =
      table && wrap
        ? Math.max(0, Math.round(table.getBoundingClientRect().width - wrap.clientWidth))
        : 0

    return {
      clipped,
      overflow,
      wide: wide.slice(0, 8),
      small: small.slice(0, 10),
      rows: document.querySelectorAll("tbody tr").length,
      text: document.body.innerText.replace(/\s+/g, " ").slice(0, 700),
    }
  })

  console.log(`\n── ${name} ${w}×${h}`)
  console.log(`   horizontal overflow: ${r.overflow}px`)
  console.log(`   table wider than its box by: ${r.clipped}px`)
  if (r.wide.length) console.log(`   past the edge:\n     ${r.wide.join("\n     ")}`)
  console.log(`   tbody rows: ${r.rows}`)
  if (r.small.length) console.log(`   small targets:\n     ${r.small.join("\n     ")}`)
  if (errs.length) console.log(`   console:\n     ${errs.slice(0, 5).join("\n     ")}`)
  console.log(`   text: ${r.text}`)
  await p.close()
}

await b.close()
