import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const U = (r) => `http://localhost:${PORT}${r}`

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })

const dialogOpen = () => p.evaluate(() => !!document.querySelector('[role="dialog"]'))
const clickStart = async () =>
  p.evaluate(() => {
    const el = [...document.querySelectorAll("header button, header a")].find((n) =>
      /get started|account/i.test(n.innerText || "")
    )
    if (!el) return null
    const label = el.innerText.replace(/\s+/g, " ").trim()
    el.click()
    return label
  })

// 1. Fresh visitor lands on the feed.
await p.goto(U("/app"), { waitUntil: "networkidle2", timeout: 60000 })
await p.evaluate(() => localStorage.clear())
await p.reload({ waitUntil: "networkidle2" })
await wait(2500)
console.log("1. feed does not auto-interrupt: ", (await dialogOpen()) === false ? "PASS" : "FAIL (modal opened)")

// 2. A control exists and opens it.
const label = await clickStart()
await wait(900)
console.log("2. header control present:      ", label ? `PASS ("${label}")` : "FAIL (no control)")
console.log("3. control opens onboarding:    ", (await dialogOpen()) ? "PASS" : "FAIL")

/* 4. Dismissing a dialog the visitor opened themselves must NOT write the
      30-day decline — that flag exists to stop an interruption repeating, and
      closing something you asked for is not a refusal. The gated path is
      checked separately at step 7b. */
await p.keyboard.press("Escape")
await wait(700)
const declined = await p.evaluate(() => !!localStorage.getItem("newera_onboard_declined"))
console.log("4. self-open dismiss ≠ decline: ", declined ? "FAIL (declined)" : "PASS")

// 5. The decline must not lock the visitor out of asking again.
await p.reload({ waitUntil: "networkidle2" })
await wait(2200)
console.log("5. no auto-modal after decline: ", (await dialogOpen()) === false ? "PASS" : "FAIL")
await clickStart()
await wait(900)
console.log("6. can still start after decline:", (await dialogOpen()) ? "PASS" : "FAIL")

// 7. Cluster deep-link still auto-opens for a genuinely new visitor.
await p.evaluate(() => localStorage.clear())
const slug = process.argv[3] || "doge-2"
await p.goto(U(`/app/theme/${slug}`), { waitUntil: "networkidle2", timeout: 60000 })
await wait(2500)
console.log("7. cluster page still gates:    ", (await dialogOpen()) ? "PASS" : "FAIL")

// 7b. The gated path IS an interruption, so dismissing it must record a decline.
await p.keyboard.press("Escape")
await wait(700)
const gatedDeclined = await p.evaluate(() => !!localStorage.getItem("newera_onboard_declined"))
console.log("7b. gated dismiss DOES decline: ", gatedDeclined ? "PASS" : "FAIL")

// 8. Once onboarded the control points at the account instead.
await p.evaluate(() => localStorage.setItem("newera_onboarded", "1"))
await p.goto(U("/app"), { waitUntil: "networkidle2", timeout: 60000 })
await wait(2000)
const after = await p.evaluate(() =>
  [...document.querySelectorAll("header a, header button")]
    .map((n) => n.innerText.replace(/\s+/g, " ").trim())
    .filter((t) => /get started|account/i.test(t))
)
console.log("8. onboarded -> account entry:  ", after.some((t) => /account/i.test(t)) ? `PASS (${JSON.stringify(after)})` : `FAIL (${JSON.stringify(after)})`)

await b.close()
