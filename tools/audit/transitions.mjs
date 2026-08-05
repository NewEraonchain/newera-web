/* View transitions, and whether they are actually running.
 *
 * DESIGN.md lists the cluster-row morph as a signature mechanic. It was dead for
 * an unknown length of time and nothing said so: React Router 7 only calls
 * `document.startViewTransition` from a DATA router, and under `<BrowserRouter>`
 * it accepts the `viewTransition` prop and silently ignores it. Measured at the
 * time — the browser supported the API, fourteen elements carried a
 * `view-transition-name`, and navigating fired it exactly zero times.
 *
 * A styling mechanic that fails silently is the worst kind, because the page
 * still looks fine. This asserts the call actually happens. */
import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE = process.argv[2] || "http://localhost:5173"

let failures = 0
const check = (ok, msg) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures++ }

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })

// Count calls to the API the `viewTransition` prop is supposed to trigger.
await p.evaluateOnNewDocument(() => {
  window.__vt = 0
  const orig = document.startViewTransition?.bind(document)
  if (orig) {
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: (cb) => {
        window.__vt++
        return orig(cb)
      },
    })
  }
})

await p.goto(`${BASE}/app`, { waitUntil: "networkidle2", timeout: 45000 })
await new Promise((r) => setTimeout(r, 4500))

const supported = await p.evaluate(() => typeof document.startViewTransition === "function")
if (!supported) {
  console.log("  SKIP  this browser has no View Transitions API — the mechanic is meant to no-op here")
  await b.close()
  process.exit(0)
}

console.log("1. the names exist")
const named = await p.evaluate(
  () => [...document.querySelectorAll("*")].filter((e) => getComputedStyle(e).viewTransitionName !== "none").length
)
check(named > 0, `elements carrying a view-transition-name (${named})`)

console.log("\n2. navigating a cluster row actually starts one")
const link = await p.$('a[href^="/app/theme/"]')
if (!link) {
  check(false, "no cluster row to click — cannot test the morph")
} else {
  const href = await p.evaluate((el) => el.getAttribute("href"), link)
  await link.click()
  await p.waitForFunction((h) => location.pathname === h, { timeout: 15000 }, href).catch(() => {})
  await new Promise((r) => setTimeout(r, 2000))
  check(p.url().includes(href), `navigation landed (${href})`)
  const calls = await p.evaluate(() => window.__vt)
  check(calls > 0, `startViewTransition was called (${calls}×) — the prop is not being silently ignored`)
}

console.log("\n3. the transition does not break the page it lands on")
const landed = await p.evaluate(() => ({
  h1: document.querySelector("h1")?.innerText.trim().slice(0, 40) || null,
  // A transition that never finishes leaves the document stuck under a
  // pseudo-element and everything below it unclickable.
  bodyVisible: getComputedStyle(document.body).opacity !== "0",
}))
check(!!landed.h1, `the destination rendered its heading ("${landed.h1}")`)
check(landed.bodyVisible, "the document is not left transparent by an unfinished transition")

await b.close()
console.log(`\n${failures === 0 ? "✅ view transition checks passed" : `❌ ${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
