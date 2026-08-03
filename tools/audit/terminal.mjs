/* Drives the token terminal in a real browser: quote, timeframes, tape, and the
   guards that stop a bad trade. Nothing here signs anything — there is no wallet
   in the page — so it exercises everything up to the point of signature. */
import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"

const BASE = "http://localhost:5173"
let failures = 0
const check = (ok, msg) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures++ }

// A token with a live v3 market, chosen from the feed so the test never goes stale.
const feed = await fetch("https://newerabackend-production.up.railway.app/intel/feed?limit=60").then(r => r.json())
const addrs = feed.items.map(i => i.address)
let target = null
for (let i = 0; i < addrs.length && !target; i += 25) {
  const ds = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addrs.slice(i, i + 25).join(",")}`).then(r => r.json())
  const p = (ds.pairs || []).find(p => p.dexId === "uniswap" && (p.labels || []).map(s => s.toLowerCase()).includes("v3") && (p.liquidity?.usd || 0) > 1000)
  if (p) target = { addr: p.baseToken.address, symbol: p.baseToken.symbol }
}
if (!target) { console.log("no v3 token in the live feed right now — cannot run"); process.exit(0) }
console.log(`target ${target.symbol} ${target.addr}\n`)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 })

const errors = []
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
page.on("pageerror", (e) => errors.push(String(e)))

await page.goto(`${BASE}/app/token/${target.addr}`, { waitUntil: "networkidle2", timeout: 45000 })

console.log("1. swap panel")
const panel = await page.waitForSelector("#swap-amount", { timeout: 25000 }).catch(() => null)
check(!!panel, "amount input renders")

if (panel) {
  // A quote must arrive and must be a real number, not a placeholder.
  const quoted = await page.waitForFunction(
    () => {
      const el = [...document.querySelectorAll("p")].find(p => /^[\d,.]+\s+\S+$/.test(p.textContent.trim()) && p.className.includes("text-2xl"))
      return el ? el.textContent.trim() : false
    },
    { timeout: 30000 }
  ).then(h => h.jsonValue()).catch(() => null)
  check(!!quoted, `live quote renders (${quoted || "none"})`)

  const body = await page.evaluate(() => document.body.innerText)
  check(/Guaranteed minimum/.test(body), "guaranteed minimum is shown before any signature")
  check(/Price impact/.test(body), "price impact is shown")
  check(/never holds your funds/i.test(body), "custody claim present and accurate")
  check(!/does not execute trades/i.test(body), "no stale 'does not execute trades' claim")

  /* The minimum must sit strictly below the estimate. Read the estimate from
     its own element rather than by scanning forward through innerText — the
     slippage buttons ("0.5% 1% 3% 5%") sit between the label and the number and
     the first digits a forward scan finds belong to them. */
  const nums = await page.evaluate(() => {
    const estEl = [...document.querySelectorAll("p")].find(
      (p) => p.className.includes("text-2xl") && /[\d,]/.test(p.textContent)
    )
    const min = document.body.innerText.match(/Guaranteed minimum\s*([\d,]+(?:\.\d+)?)/)
    const f = (s) => (s ? parseFloat(s.replace(/,/g, "")) : null)
    return {
      est: f(estEl?.textContent.trim().match(/^([\d,]+(?:\.\d+)?)/)?.[1]),
      min: f(min?.[1]),
    }
  })
  check(nums.est && nums.min && nums.min < nums.est, `minimum (${nums.min}) sits below estimate (${nums.est})`)

  // Raising slippage must lower the guaranteed minimum. If it does not, the
  // control is decorative and the user is not protected by what it claims.
  const before = nums.min
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "5%")
    b?.click()
  })
  await new Promise(r => setTimeout(r, 2500))
  const after = await page.evaluate(() => {
    const m = document.body.innerText.match(/Guaranteed minimum\s*([\d,]+(?:\.\d+)?)/)
    return m ? parseFloat(m[1].replace(/,/g, "")) : null
  })
  check(after !== null && before !== null && after < before, `5% slippage lowers the floor (${before} → ${after})`)
}

console.log("\n2. chart timeframes")
const tfs = await page.evaluate(() =>
  [...document.querySelectorAll('[aria-label="Chart timeframe"] button')].map(b => b.textContent.trim())
)
check(tfs.length >= 5, `timeframe controls render (${tfs.join(" ")})`)
const switched = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('[aria-label="Chart timeframe"] button')]
  const one = btns.find(b => b.textContent.trim() === "1h")
  if (!one) return null
  one.click()
  return true
})
if (switched) {
  await new Promise(r => setTimeout(r, 1500))
  const iframeSrc = await page.evaluate(() => document.querySelector('iframe[title*="chart"]')?.src || "")
  check(/interval=60/.test(iframeSrc), `1h drives the embed interval (${iframeSrc.split("?")[1]?.slice(0, 60) || "no src"})`)
  const pressed = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-label="Chart timeframe"] button')].find(b => b.textContent.trim() === "1h")?.getAttribute("aria-pressed")
  )
  check(pressed === "true", "selected timeframe is announced with aria-pressed")
}

console.log("\n3. the tape")
/* Wait for rows, not merely for the loading text to clear. The section leaves
   its skeleton the moment the first read returns, and an RPC hiccup on that
   first read renders the empty state — which looks identical to "this pool is
   quiet" and silently passed a check that only watched the spinner. */
const tape = await page.waitForFunction(
  () => document.querySelectorAll("table tbody tr").length > 0 ||
        /No fills in the last few minutes|connection lost/.test(document.body.innerText),
  { timeout: 45000 }
).then(() => true).catch(() => false)
check(tape, "trades section resolves to rows or an explained empty state")
const tapeInfo = await page.evaluate(() => {
  const rows = document.querySelectorAll("table tbody tr")
  const heads = [...document.querySelectorAll("table thead th")].map(h => h.textContent.trim())
  const sides = [...rows].map(r => r.children[1]?.textContent.trim())
  return { rows: rows.length, heads, buys: sides.filter(s => s === "Buy").length, sells: sides.filter(s => s === "Sell").length }
})
if (tapeInfo.rows > 0) {
  check(tapeInfo.heads.includes("Side") && tapeInfo.heads.includes("ETH"), `table has real headers (${tapeInfo.heads.join(", ")})`)
  check(tapeInfo.buys + tapeInfo.sells === tapeInfo.rows, `every row is classified (${tapeInfo.buys} buys, ${tapeInfo.sells} sells of ${tapeInfo.rows})`)

  /* The Trader column must hold traders. The Swap event's `recipient` is the
     router on a sell, so reading it directly printed SwapRouter02 as the
     counterparty on every sell row. */
  const ROUTERS = ["0xcaf6", "0x8876"]
  const traders = await page.evaluate(() =>
    [...document.querySelectorAll("table tbody tr")].map((r) => r.children[4]?.textContent.trim().toLowerCase())
  )
  const routerRows = traders.filter((t) => ROUTERS.some((r) => t?.startsWith(r)))
  check(routerRows.length === 0, `no router addresses shown as traders (${routerRows.length} of ${traders.length})`)
  check(new Set(traders).size > 1, `traders are distinct addresses (${new Set(traders).size} unique)`)
} else {
  const why = await page.evaluate(() => /connection lost/.test(document.body.innerText) ? "RPC read failed" : "pool genuinely quiet")
  console.log(`  note: no rows — ${why}`)
  check(why === "pool genuinely quiet", `empty tape is explained, not a silent failure (${why})`)
}

console.log("\n4. console")
const real = errors.filter(e => !/DexScreener|dexscreener|Failed to load resource|net::ERR|favicon/i.test(e))
check(real.length === 0, `no unexplained console errors (${real.length}${real.length ? ": " + real[0].slice(0, 100) : ""})`)

await page.screenshot({ path: "tools/audit/out/terminal.png", fullPage: false })
console.log(`\n${failures === 0 ? "✅ terminal checks passed" : `❌ ${failures} FAILED`}`)
await browser.close()
process.exit(failures === 0 ? 0 : 1)
