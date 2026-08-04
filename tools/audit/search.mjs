/* The shortest route to a coin. Reaching one used to take four steps — site,
   feed, a cluster, then its launch list — so this asserts the one-step path
   works for both ways a person arrives: a ticker somebody mentioned, and an
   address somebody pasted. */
import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE = process.argv[2] || "http://localhost:5173"

let failures = 0
const check = (ok, msg) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures++ }

const feed = await fetch("https://newerabackend-production.up.railway.app/intel/feed?limit=5").then(r => r.json())
const target = feed.items[0]

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
await p.goto(`${BASE}/app`, { waitUntil: "networkidle2", timeout: 45000 })

console.log("1. the field is on the first screen")
const box = await p.waitForSelector("#feed-search", { timeout: 20000 }).catch(() => null)
check(!!box, "a search field exists on the feed")
const y = await p.evaluate(() => {
  const el = document.querySelector("#feed-search")
  return el ? Math.round(el.getBoundingClientRect().top) : null
})
check(y !== null && y < 900, `it sits in the first viewport (y=${y})`)

console.log("\n2. a ticker finds the coin")
await p.type("#feed-search", target.symbol.slice(0, 6))
await new Promise(r => setTimeout(r, 2200))
const results = await p.evaluate(() => {
  const links = [...document.querySelectorAll('form[role="search"] a[href^="/app/token/"]')]
  return { n: links.length, first: links[0]?.getAttribute("href") || null, text: document.querySelector('form[role="search"]')?.innerText.slice(0, 120) }
})
check(results.n > 0, `typing "${target.symbol.slice(0, 6)}" returns results (${results.n})`)

console.log("\n3. it goes straight to the token page")
if (results.n > 0) {
  await p.click('form[role="search"] a[href^="/app/token/"]')
  await new Promise(r => setTimeout(r, 2500))
  const url = p.url()
  check(/\/app\/token\/0x[a-fA-F0-9]{40}/.test(url), `one click lands on a token page (${url.split("/").pop().slice(0, 14)}…)`)
}

console.log("\n4. a pasted address is one step, with no list to pick from")
await p.goto(`${BASE}/app`, { waitUntil: "networkidle2", timeout: 45000 })
await p.waitForSelector("#feed-search", { timeout: 20000 })
await p.type("#feed-search", target.address)
await new Promise(r => setTimeout(r, 900))
await p.keyboard.press("Enter")
await new Promise(r => setTimeout(r, 2500))
check(
  p.url().toLowerCase().includes(`/app/token/${target.address.toLowerCase()}`),
  `submitting an address opens that exact token (${p.url().split("/").pop().slice(0, 14)}…)`
)

console.log("\n5. a miss says so rather than showing nothing")
await p.goto(`${BASE}/app`, { waitUntil: "networkidle2", timeout: 45000 })
await p.waitForSelector("#feed-search", { timeout: 20000 })
await p.type("#feed-search", "zzzqqqxx")
/* A term that matches nothing is the SLOWEST query, not the fastest: Postgres
   cannot short-circuit on LIMIT and scans every row. Measured at ~1.4s against
   ~0.7s for a hit, so a 2.5s wait raced it and read the loading state. */
await p.waitForFunction(
  () => !/searching the index/i.test(document.querySelector('form[role="search"]')?.innerText || ""),
  { timeout: 15000 }
).catch(() => {})
const miss = await p.evaluate(() => document.querySelector('form[role="search"]')?.innerText || "")
check(/nothing in the index matches/i.test(miss), `an empty result is explained ("${miss.replace(/\s+/g, " ").slice(0, 60)}…")`)

await b.close()
console.log(`\n${failures === 0 ? "✅ search checks passed" : `❌ ${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
