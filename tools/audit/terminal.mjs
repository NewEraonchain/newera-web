/* Drives the token terminal in a real browser: quote, timeframes, tape, and the
   guards that stop a bad trade. Nothing here signs anything — there is no wallet
   in the page — so it exercises everything up to the point of signature. */
import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"

const BASE = "http://localhost:5173"
let failures = 0
const check = (ok, msg) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures++ }

/* One v3 and one v4 token, chosen from the live feed so the test never goes
   stale. Both protocols must render a working panel — v4 was a handoff until it
   was routed, and a regression there would look identical to "no market". */
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73"
const feed = await fetch("https://newerabackend-production.up.railway.app/intel/feed?limit=80").then(r => r.json())
const addrs = feed.items.map(i => i.address)
const targets = { v4list: [] }
for (let i = 0; i < addrs.length && (!targets.v3 || targets.v4list.length < 5); i += 25) {
  const ds = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addrs.slice(i, i + 25).join(",")}`).then(r => r.json())
  for (const p of ds.pairs || []) {
    if (p.dexId !== "uniswap" || (p.liquidity?.usd || 0) < 1000) continue
    const labels = (p.labels || []).map(s => s.toLowerCase())
    const e = { addr: p.baseToken.address, symbol: p.baseToken.symbol }
    if (!targets.v3 && labels.includes("v3") && String(p.quoteToken?.address).toLowerCase() === WETH) targets.v3 = e
    if (labels.includes("v4") && targets.v4list.length < 5 && !targets.v4list.some(x => x.addr === e.addr)) targets.v4list.push(e)
  }
}
const target = targets.v3 || targets.v4list[0]
if (!target) { console.log("no routable token in the live feed right now — cannot run"); process.exit(0) }
console.log(`v3 target ${targets.v3?.symbol || "none"} · ${targets.v4list.length} v4 candidates\n`)

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
  /* Poll rather than sleep a fixed span. Re-quoting is debounced and then makes
     several chain round-trips, so a single 2.5s wait sampled before the update
     had landed and reported the control as dead when it was merely slow. */
  const after = await page.waitForFunction(
    (prev) => {
      const m = document.body.innerText.match(/Guaranteed minimum\s*([\d,]+(?:\.\d+)?)/i)
      if (!m) return false
      const v = parseFloat(m[1].replace(/,/g, ""))
      return v !== prev ? v : false
    },
    { timeout: 20000 }, before
  ).then(h => h.jsonValue()).catch(() => before)
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
  /* Only meaningful with enough rows. One address making every recent fill is a
     real market state on a thin new pool — asserting on it tests the market, not
     the code. What must always hold is that no ROUTER address appears, which the
     check above covers unconditionally. */
  const uniq = new Set(traders).size
  if (traders.length >= 8) {
    check(uniq > 1, `traders are distinct addresses (${uniq} unique of ${traders.length})`)
  } else {
    console.log(`  note: only ${traders.length} fills — too few to expect distinct traders (${uniq} unique)`)
  }
} else {
  const why = await page.evaluate(() => /connection lost/.test(document.body.innerText) ? "RPC read failed" : "pool genuinely quiet")
  console.log(`  note: no rows — ${why}`)
  check(why === "pool genuinely quiet", `empty tape is explained, not a silent failure (${why})`)
}

console.log("\n4. console")
/* "Failed to fetch" is a transient network condition the app handles by design
   (markets.ts reports ok:false rather than claiming anything about a token), so
   it is noise here, not a defect. */
const real = errors.filter(e => !/DexScreener|dexscreener|Failed to load resource|Failed to fetch|net::ERR|favicon/i.test(e))
check(real.length === 0, `no unexplained console errors (${real.length}${real.length ? ": " + real[0].slice(0, 100) : ""})`)

/* 5. Selling. The tab must exist, switch what the amount means, and quote in the
   other direction — a sell that silently quotes a buy would be catastrophic. */
console.log("\n5. selling")
const sellSwitched = await page.evaluate(() => {
  const b = [...document.querySelectorAll('[aria-label="Trade direction"] button')].find(b => /^Sell/.test(b.textContent.trim()))
  if (!b) return false
  b.click()
  return true
})
check(sellSwitched, "a Sell tab exists alongside Buy")
if (sellSwitched) {
  await new Promise(r => setTimeout(r, 1200))
  const sell = await page.evaluate(() => {
    const t = document.body.innerText
    return {
      /* Case-insensitive on purpose: the label carries a `uppercase` class and
         innerText reflects CSS text-transform, so it reads "YOU PAY (…)". */
      paysToken: /you pay \((?!eth\))/i.test(t),
      receivesEth: /you receive \(estimated\)/i.test(t),
      warnsApprovals: /one-time approvals/i.test(t),
      hasMax: [...document.querySelectorAll("button")].some(b => b.textContent.trim() === "Max"),
      label: [...document.querySelectorAll("button")].some(b => b.textContent.trim() === "Sell"),
    }
  })
  check(sell.paysToken, "selling pays the token, not ETH")
  check(sell.hasMax, "a Max control is offered for the balance")
  check(sell.warnsApprovals, "the approval steps are disclosed before the wallet asks")
  check(sell.label, "the action button says Sell")
}

/* 6. v4 routing.
 *
 * Walk several v4 candidates rather than one. Most v4 launch pools on this chain
 * are drained — a live price with nothing behind it — and declining those is the
 * CORRECT behaviour, verified against the quoter. But if the test only ever sees
 * a drained pool it never exercises the routing path at all, and a broken v4
 * route would pass silently while every page showed the handoff. So: every
 * decline must carry a reason, and at least one candidate should reach a panel
 * when the chain has a tradeable v4 pool to offer. */
console.log("\n6. v4 routing")
if (!targets.v4list.length) {
  console.log("  note: no v4 markets in the feed right now")
} else {
  let panels = 0, declines = 0
  for (const t of targets.v4list) {
    await page.goto(`${BASE}/app/token/${t.addr}`, { waitUntil: "networkidle2", timeout: 45000 })
    const state = await page.waitForFunction(
      () => {
        if (document.querySelector("#swap-amount")) return "panel"
        if (/Trading this one happens elsewhere/.test(document.body.innerText)) return "handoff"
        return false
      },
      { timeout: 40000 }
    ).then(h => h.jsonValue()).catch(() => "timeout")

    if (state === "panel") {
      panels++
      const quoted = await page.waitForFunction(
        () => { const p = [...document.querySelectorAll("p")].find(p => p.className.includes("text-2xl")); return p && /\d/.test(p.textContent) ? p.textContent.trim() : false },
        { timeout: 30000 }
      ).then(h => h.jsonValue()).catch(() => null)
      check(!!quoted, `${t.symbol}: v4 panel renders a live quote (${quoted || "none"})`)
      check(await page.evaluate(() => /Uniswap v4/i.test(document.body.innerText)), `${t.symbol}: panel names the protocol as v4`)

      /* The v4 tape reads the PoolManager rather than a pool contract, and its
         amounts carry the OPPOSITE sign convention to v3. A mix of both sides is
         the cheapest evidence that the convention was not applied backwards —
         inverted signs would render every row identically. */
      await page.waitForFunction(
        () => document.querySelectorAll("table tbody tr").length > 0 ||
              /No fills in the last few minutes|connection lost/.test(document.body.innerText),
        { timeout: 45000 }
      ).catch(() => {})
      const v4tape = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("table tbody tr")]
        const sides = rows.map(r => r.children[1]?.textContent.trim())
        return { rows: rows.length, buys: sides.filter(s => s === "Buy").length, sells: sides.filter(s => s === "Sell").length }
      })
      if (v4tape.rows > 0) {
        check(v4tape.buys + v4tape.sells === v4tape.rows, `${t.symbol}: v4 tape classifies every row (${v4tape.buys} buys, ${v4tape.sells} sells of ${v4tape.rows})`)
        /* Only meaningful with enough rows to expect both sides. A quiet pool
           can legitimately show two buys and nothing else; asserting on that
           tests the market, not the code. The sign convention itself is checked
           deterministically against transaction values in swap.mjs. */
        if (v4tape.rows >= 8) {
          check(v4tape.buys > 0 && v4tape.sells > 0, `${t.symbol}: v4 tape shows both sides across ${v4tape.rows} rows`)
        } else {
          console.log(`  note: only ${v4tape.rows} v4 fills — too few to expect both sides`)
        }
      } else {
        console.log(`  note: ${t.symbol} v4 tape had no fills in window`)
      }
      break
    } else if (state === "handoff") {
      declines++
      const reason = await page.evaluate(() => {
        const t = document.body.innerText
        const i = t.indexOf("Trading this one happens elsewhere")
        // The first NON-EMPTY line after the heading — innerText puts a blank
        // line between block elements, so [1] is reliably "".
        return t.slice(i, i + 400).split("\n").slice(1).map(s => s.trim()).find(Boolean) || ""
      })
      check(reason.length > 20, `${t.symbol}: declines with a stated reason — "${reason.slice(0, 80)}…"`)
    } else {
      check(false, `${t.symbol}: v4 page never resolved (${state})`)
    }
  }
  console.log(`  ${panels} routable, ${declines} declined of ${targets.v4list.length} v4 candidates tried`)
}

await page.screenshot({ path: "tools/audit/out/terminal.png", fullPage: false })
console.log(`\n${failures === 0 ? "✅ terminal checks passed" : `❌ ${failures} FAILED`}`)
await browser.close()
process.exit(failures === 0 ? 0 : 1)
