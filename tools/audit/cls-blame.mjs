/* Which element moved, and by how much.
 *
 * perf.mjs says a route is over the CLS budget; this says what to go and fix.
 * Layout-shift entries carry `sources` with the node and its before/after
 * rects, which is the difference between "the landing page shifts 2.0" and
 * "the pinned section reports height 0 then 900, twice".
 *
 *   node tools/audit/cls-blame.mjs /app
 *   node tools/audit/cls-blame.mjs / scroll     (also drives the scroll)
 *
 * On Git Bash, prefix with MSYS_NO_PATHCONV=1 or the leading slash in the
 * route is rewritten into a Windows path before node ever sees it.
 */
import puppeteer from "puppeteer-core"
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: "new" })
const route = process.argv[2] || "/app"
const scroll = process.argv[3] === "scroll"
const p = await b.newPage(); await p.setViewport({width:1440,height:900})
await p.evaluateOnNewDocument(`
  window.__s = []
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue
      window.__s.push({ v: e.value, t: Math.round(e.startTime),
        src: (e.sources||[]).map(s => ({
          n: s.node ? (s.node.tagName + "." + String(s.node.className||"").slice(0,55)) : "?",
          from: s.previousRect ? [Math.round(s.previousRect.y), Math.round(s.previousRect.height)] : null,
          to: s.currentRect ? [Math.round(s.currentRect.y), Math.round(s.currentRect.height)] : null,
        })) })
    }
  }).observe({ type: "layout-shift", buffered: true })
`)
await p.goto("http://localhost:5173"+route,{waitUntil:"networkidle2"}).catch(()=>{})
await new Promise(r=>setTimeout(r,3000))
if (scroll) { for (let i=0;i<24;i++){ await p.mouse.wheel({deltaY:400}); await new Promise(r=>setTimeout(r,90)) } await new Promise(r=>setTimeout(r,1200)) }
const s = await p.evaluate(()=>window.__s || []); console.log("entries:", s.length)
s.sort((a,z)=>z.v-a.v)
let total = s.reduce((a,x)=>a+x.v,0)
console.log(`${route}  total CLS ${total.toFixed(3)}  across ${s.length} shifts\n`)
for (const e of s.slice(0,8)) {
  console.log(`  ${e.v.toFixed(4)} @${e.t}ms`)
  for (const x of e.src.slice(0,3)) console.log(`      ${x.n}  y ${x.from?.[0]}→${x.to?.[0]}  h ${x.from?.[1]}→${x.to?.[1]}`)
}
await b.close()
