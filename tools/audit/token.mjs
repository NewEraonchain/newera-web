import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const ok = (n, p, extra = "") => console.log(`${p ? "PASS" : "FAIL"}  ${n}${extra ? "  — " + extra : ""}`)
const API = "https://newerabackend-production.up.railway.app"

// Pick a token that actually has a market, so the chart path is exercised.
const feed = await (await fetch(`${API}/intel/feed?limit=30`)).json()
const addrs = feed.items.slice(0, 25).map((l) => l.address)
const dex = await (await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addrs.join(",")}`)).json()
const traded = (dex.pairs || []).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0]
const withMarket = traded?.baseToken?.address
const noMarket = addrs.find((a) => !(dex.pairs || []).some((p) => p.baseToken.address.toLowerCase() === a.toLowerCase()))
console.log(`with market: ${withMarket} (${traded?.baseToken?.symbol})\nwithout:     ${noMarket}\n`)

// Is the index endpoint deployed yet?
const probe = await fetch(`${API}/intel/token/${withMarket}`)
console.log(`GET /intel/token/:address -> HTTP ${probe.status}${probe.status === 404 ? " (not deployed yet, or unknown token)" : ""}\n`)

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
const errs = []
p.on("pageerror", (e) => errs.push(String(e).slice(0, 140)))

/* 1. A traded token: market block, chart, handoff. */
await p.goto(`http://localhost:${PORT}/app/token/${withMarket}`, { waitUntil: "domcontentloaded", timeout: 60000 })
await wait(7000)
const r = await p.evaluate(() => ({
  text: document.body.innerText.replace(/\s+/g, " "),
  title: document.title,
  iframes: [...document.querySelectorAll("iframe")].map((f) => f.getAttribute("src")),
  trade: [...document.querySelectorAll("a")].find((a) => /trade on/i.test(a.innerText))?.getAttribute("href") || null,
  addrShown: document.body.innerText.includes(location.pathname.split("/").pop()),
}))
ok("1a renders a market block", /liquidity/i.test(r.text) && /traded 24h/i.test(r.text))
ok("1b embeds the chart", r.iframes.some((s) => /dexscreener/.test(s || "")), r.iframes[0] || "no iframe")
ok("1c offers the handoff", !!r.trade && /dexscreener/.test(r.trade), r.trade || "none")
ok("1d states we do not execute", /does not execute trades and holds no keys/i.test(r.text))
ok("1e address is selectable text", r.addrShown)
ok("1f titles itself", /Token · NewEra$/.test(r.title), r.title)
ok("1g no page errors", errs.length === 0, errs.join(" | ") || "clean")

/* 2. The index half degrades honestly while the endpoint is undeployed. */
ok(
  "2 index section explains itself",
  /not in the index|is not answering|What the index knows/i.test(r.text),
  probe.status === 200 ? "endpoint live" : "endpoint 404 - degraded path"
)

/* 3. A token with no market says so, without claiming a failure. */
if (noMarket) {
  await p.goto(`http://localhost:${PORT}/app/token/${noMarket}`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await wait(6000)
  const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "))
  ok("3 no-market token says so", /No market yet/i.test(t) && !/unavailable right now/i.test(t))
}

/* 4. Reaching it from the tape, which used to leave the site. */
await p.goto(`http://localhost:${PORT}/app`, { waitUntil: "domcontentloaded", timeout: 60000 })
await p.evaluate(() => localStorage.setItem("newera_onboard_declined", String(Date.now())))
await wait(6000)
const hop = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/app/token/"]')][0]
  if (!a) return null
  a.click()
  return a.getAttribute("href")
})
ok("4a tape rows link to the token page", !!hop, hop || "no internal token link on /app")
if (hop) {
  await wait(5000)
  ok("4b clicking one lands there", (await p.evaluate(() => location.pathname)).startsWith("/app/token/"))
}

/* 5. A bad address fails honestly. */
await p.goto(`http://localhost:${PORT}/app/token/0xnope`, { waitUntil: "domcontentloaded", timeout: 60000 })
await wait(5000)
const bad = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "))
ok("5 bad address does not crash", /not in the index|not answering|No market yet/i.test(bad), bad.slice(0, 70))

await b.close()
