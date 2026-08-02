import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const ok = (n, p, extra = "") => console.log(`${p ? "PASS" : "FAIL"}  ${n}${extra ? "  — " + extra : ""}`)
const API = "https://newerabackend-production.up.railway.app"

// A wallet that definitely has a record, taken from the live feed.
const feed = await (await fetch(`${API}/intel/feed?limit=40`)).json()
const counts = {}
for (const l of feed.items) counts[l.creator] = (counts[l.creator] || 0) + 1
const wallet = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
const dossier = await (await fetch(`${API}/intel/creators/${wallet}`)).json()
console.log(`wallet ${wallet}: ${dossier.profile?.totalLaunches} launches, ${dossier.profile?.duplicateRate}% dupes\n`)

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
const errs = []
p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)))

/* 1. The page renders the record. */
await p.goto(`http://localhost:${PORT}/app/creator/${wallet}`, { waitUntil: "domcontentloaded", timeout: 60000 })
await wait(6000)
const r = await p.evaluate(() => ({
  text: document.body.innerText.replace(/\s+/g, " "),
  title: document.title,
  rows: document.querySelectorAll(".scan-row").length,
}))
ok("1a renders the deployer record", r.text.includes("This address has deployed"), r.text.slice(0, 90))
ok("1b shows the launch count", r.text.includes(dossier.profile.totalLaunches.toLocaleString("en-US")))
ok("1c shows the duplicate rate", r.text.includes(`${dossier.profile.duplicateRate}%`))
ok("1d lists their launches", r.rows > 0, `${r.rows} rows`)
ok("1e titles itself", /Deployer · NewEra$/.test(r.title), r.title)
ok("1f no page errors", errs.length === 0, errs.join(" | ") || "clean")

/* 2. It states the limit of what it means. */
ok("2 disclaims judgement", /not a judgement of the person/i.test(r.text))

/* 3. The journey that was a dead end: cluster -> who is launching -> deployer. */
const themes = await (await fetch(`${API}/intel/themes?limit=1`)).json()
const slug = themes.items[0].slug
await p.goto(`http://localhost:${PORT}/app`, { waitUntil: "domcontentloaded", timeout: 60000 })
await p.evaluate(() => localStorage.setItem("newera_onboard_declined", String(Date.now())))
await p.goto(`http://localhost:${PORT}/app/theme/${slug}`, { waitUntil: "domcontentloaded", timeout: 60000 })
await wait(5000)
const link = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/app/creator/"]')][0]
  if (!a) return null
  a.click()
  return a.getAttribute("href")
})
ok("3a cluster page links to the deployer", !!link, link || "no internal creator link found")
if (link) {
  await wait(5000)
  /* Either outcome is correct. A wallet with one launch has no CreatorProfile
     row, and the page says so rather than inventing a record — asserting only
     on "deployed" failed on that entirely valid state. */
  const after = await p.evaluate(() => ({
    path: location.pathname,
    has: /deployed|No behavioural record has been built/i.test(document.body.innerText),
  }))
  ok("3b clicking it lands on the record", after.path.startsWith("/app/creator/") && after.has, after.path)
}

/* 4. A bad address fails honestly. */
await p.goto(`http://localhost:${PORT}/app/creator/not-a-wallet`, { waitUntil: "domcontentloaded", timeout: 60000 })
await wait(4000)
const bad = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "))
ok("4 bad address explains itself", /does not look like a wallet address|No launches recorded/i.test(bad), bad.slice(0, 80))

await b.close()
