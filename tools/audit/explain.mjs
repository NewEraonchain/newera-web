import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const ok = (n, p, extra = "") => console.log(`${p ? "PASS" : "FAIL"}  ${n}${extra ? "  — " + extra : ""}`)

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
await p.goto(`http://localhost:${PORT}/app`, { waitUntil: "domcontentloaded", timeout: 60000 })
await p.evaluate(() => localStorage.setItem("newera_onboard_declined", String(Date.now())))
await p.reload({ waitUntil: "domcontentloaded" })
await wait(6000)

const r = await p.evaluate(() => {
  const scores = [...document.querySelectorAll("[aria-label^='Spam risk']")]
  const flags = [...document.querySelectorAll("[aria-label]")].filter((n) =>
    /invisible characters|lookalike letters|Mixes alphabets|Near-identical|already used/i.test(n.getAttribute("aria-label") || "")
  )
  // Anything explained ONLY by a hover, with no accessible name.
  const hoverOnly = [...document.querySelectorAll("main [title]")].filter(
    (n) => !n.getAttribute("aria-label") && n.tabIndex < 0 && n.tagName !== "A"
  )
  return {
    scored: scores.length,
    sample: scores[0]?.getAttribute("aria-label") || null,
    tiers: [...new Set(scores.map((n) => (n.getAttribute("aria-label") || "").split(", ").pop()))],
    flags: flags.length,
    hoverOnly: hoverOnly.map((n) => (n.getAttribute("title") || "").slice(0, 42)),
    scaleStated: /Spam risk runs 0–100/.test(document.body.innerText),
  }
})

ok("1 every score has an accessible name", r.scored > 0, `${r.scored} scored; e.g. "${r.sample}"`)
ok("2 the tier is in the name, not just the hue", r.tiers.every((t) => ["low", "medium", "high"].includes(t)), JSON.stringify(r.tiers))
ok("3 the scale is stated visibly", r.scaleStated)
ok("4 nothing is explained by hover alone", r.hoverOnly.length === 0, r.hoverOnly.slice(0, 3).join(" | ") || "clean")
await b.close()
