/* What the page costs, measured rather than guessed.
 *
 * Four things, each of which was a real finding:
 *
 *   layout shift   — CLS is normally quoted for load. This world pins sections
 *                    and scrubs them with ScrollTrigger, so the shift that
 *                    matters happens WHILE SCROLLING and a load-only reading
 *                    misses all of it.
 *   duplicate reads — how many times the same URL is fetched on one page load.
 *   idle work      — frames rendered per second with the user doing nothing.
 *   RPC chatter    — JSON-RPC POSTs, which is what an unbatched viem transport
 *                    turns one page into.
 *
 * Run against the dev server: node tools/audit/perf.mjs [port]
 */
import puppeteer from "puppeteer-core"

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const PORT = process.argv[2] || "5173"
const BASE = `http://localhost:${PORT}`
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--window-size=1440,900"],
})

/* The observer has to be installed before anything renders, so it goes in via
   evaluateOnNewDocument rather than after the load. */
const INSTRUMENT = `
  window.__cls = 0
  window.__clsAfterLoad = 0
  window.__loaded = false
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue
      window.__cls += e.value
      if (window.__loaded) window.__clsAfterLoad += e.value
    }
  }).observe({ type: "layout-shift", buffered: true })
  addEventListener("load", () => setTimeout(() => (window.__loaded = true), 500))

  /* Count the APP's frame callbacks, not the display.
   *
   * The obvious instrument — run your own rAF loop and count iterations —
   * measures the monitor: it ticks at the refresh rate whether the page is
   * doing anything or not, and reported 144 "idle fps" on a 144Hz panel with
   * the app completely still. Wrapping requestAnimationFrame counts the
   * callbacks the page itself schedules, which is the actual question. */
  window.__raf = 0
  const _raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) => {
    window.__raf++
    return _raf(cb)
  }
`

/* The display's refresh rate, measured once on a blank page.
 *
 * Idle rAF callbacks are only meaningful as a multiple of it: 293/s means two
 * loops on a 146Hz panel and five on a 60Hz one, and the number that matters is
 * the count of loops. One is the floor here — gsap.ticker drives Lenis and has
 * to run for a wheel event to be answered on the next frame — so the threshold
 * is on loops ABOVE that. */
const refresh = await (async () => {
  const p = await browser.newPage()
  await p.evaluateOnNewDocument("window.__f=0;(function t(){window.__f++;requestAnimationFrame(t)})()")
  await p.goto("about:blank")
  await wait(1500)
  const n = await p.evaluate(() => window.__f)
  await p.close()
  return Math.max(30, Math.round(n / 1.5))
})()
console.log(`display refresh ~${refresh}Hz`)

const ROUTES = ["/", "/app", "/about", "/detection", "/app/token/0x25dc2a47d6df17a4cbde5213289df5ee78e5f178"]
const rows = []

for (const route of ROUTES) {
  const p = await browser.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.evaluateOnNewDocument(INSTRUMENT)

  const urls = []
  let bytes = 0
  p.on("request", (r) => urls.push({ url: r.url(), type: r.resourceType(), method: r.method() }))
  p.on("response", async (r) => {
    const len = Number(r.headers()["content-length"] || 0)
    if (len) bytes += len
  })

  await p.goto(BASE + route, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {})
  await wait(2500)

  // Idle: nothing touched, count the app's own scheduled frames over 2s.
  await p.evaluate(() => (window.__raf = 0))
  await wait(2000)
  const idleFps = Math.round((await p.evaluate(() => window.__raf)) / 2)

  const clsLoad = await p.evaluate(() => window.__cls)

  /* Scroll the way a reader does — Lenis intercepts wheel events and runs its
     own rAF loop, so scrollTo() would bypass the exact code path that produces
     the shift. */
  for (let i = 0; i < 24; i++) {
    await p.mouse.wheel({ deltaY: 400 })
    await wait(90)
  }
  await wait(1200)
  const clsTotal = await p.evaluate(() => window.__cls)

  const rpc = urls.filter((u) => u.method === "POST" && /rpc|alchemy|infura|robinhood/i.test(u.url)).length
  const api = urls.filter((u) => /\/intel\//.test(u.url))
  const dupes = {}
  for (const u of api) {
    const k = u.url.replace(/^https?:\/\/[^/]+/, "")
    dupes[k] = (dupes[k] || 0) + 1
  }
  const repeated = Object.entries(dupes).filter(([, n]) => n > 1)
  const js = urls.filter((u) => u.type === "script").length

  rows.push({ route, clsLoad, clsScroll: clsTotal - clsLoad, idleFps, loops: idleFps / refresh, rpc, js, repeated, apiCalls: api.length })
  await p.close()
}

await browser.close()

const f = (n) => n.toFixed(3).padStart(7)
console.log("\nroute          CLS load   CLS scroll   idle fps   RPC POSTs   /intel calls")
for (const r of rows) {
  console.log(
    `${r.route.slice(0, 22).padEnd(23)}${f(r.clsLoad)}      ${f(r.clsScroll)}    ${(r.loops.toFixed(1) + "x").padStart(10)}   ${String(r.rpc).padStart(9)}   ${String(r.apiCalls).padStart(12)}`
  )
}
console.log("\nrepeated requests on one page load:")
let any = false
for (const r of rows) {
  for (const [url, n] of r.repeated) {
    any = true
    console.log(`  ${r.route.slice(0, 22).padEnd(23)} ${n}x  ${url}`)
  }
}
if (!any) console.log("  none")

/* Thresholds, and why these ones.
 *
 * CLS 0.1 is Google's "good" boundary, and it is applied to load AND scroll
 * together because this page pins sections — a load-only reading scored 0.016
 * on a landing page that shifted 1.99 while being read.
 *
 * Idle loops: 1x is the floor, because gsap.ticker drives Lenis and a wheel
 * event has to be answered on the next frame. 2x means something is animating
 * that nobody asked for. Not counted: ScrollTrigger's `_rafBugFix`, an empty
 * reschedule that only `ScrollTrigger.disable()` can stop — and disabling every
 * trigger to save one no-op callback would cost pins and scrub positions. A
 * genuinely hidden tab has its rAF throttled by the browser regardless. */
const bad = rows.filter((r) => r.clsLoad + r.clsScroll > 0.1 || r.loops > 2.4)
console.log(
  bad.length
    ? `\n${bad.length} route(s) over threshold: ${bad.map((b) => b.route).join(", ")}`
    : "\nevery route within CLS and idle thresholds"
)
