import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
const errs = []
p.on("pageerror", (e) => errs.push(String(e).slice(0, 140)))
p.on("console", (m) => m.type() === "error" && errs.push("console: " + m.text().slice(0, 140)))
let hit = 0
await p.setRequestInterception(true)
p.on("request", (r) => {
  if (r.url().includes("/intel/themes")) {
    hit++
    return r.respond({
      status: 200,
      contentType: "application/json",
      // Without this the browser blocks the injected cross-origin response and
      // the app sees a network failure instead of the poisoned payload.
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        items: [
          { id: "x", slug: "x", label: "X", launchCount: 4, creatorCount: 2, ageMinutes: 5,
            status: "EMERGING", isOrganic: true, organicRatio: 0.5, peakVelocity: 1,
            firstSeenAt: new Date(0).toISOString(), lastSeenAt: new Date(0).toISOString(),
            samples: "not-an-array" },
        ],
      }),
    })
  }
  r.continue()
})
await p.goto(`http://localhost:${process.argv[2] || "5173"}/app`, { waitUntil: "networkidle2", timeout: 60000 })
await wait(6000)
const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "))
console.log("themes intercepted:", hit)
console.log("page errors:", errs.length ? errs.slice(0, 3) : "none")
console.log("worth-looking-at section:", (t.match(/Worth looking at.{0,220}/) || ["(not found)"])[0])
console.log("recovery text present:", /broke on this page|moved on/i.test(t))
await b.close()
