/* Which loop is running while the page sits still.
 *
 * perf.mjs counts idle frame callbacks; this attributes them. Wrapping
 * requestAnimationFrame and keying on the callback's own source is enough to
 * tell gsap.ticker apart from a shader loop that forgot to stop off-screen —
 * which was the finding it was written for.
 *
 *   node tools/audit/raf-blame.mjs /
 *
 * On Git Bash, prefix with MSYS_NO_PATHCONV=1 (see cls-blame.mjs).
 */
import puppeteer from "puppeteer-core"
const b = await puppeteer.launch({ executablePath: process.env.CHROME, headless: "new" })
const route = process.argv[2] || "/"
const p = await b.newPage(); await p.setViewport({width:1440,height:900})
await p.evaluateOnNewDocument(`
  window.__by = {}
  const _r = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) => {
    try {
      const k = (cb.name || "anon") + " :: " + String(cb).replace(/\s+/g," ").slice(0, 90)
      window.__by[k] = (window.__by[k] || 0) + 1
    } catch {}
    return _r(cb)
  }
`)
await p.goto("http://localhost:5173"+route,{waitUntil:"networkidle2"}).catch(()=>{})
await new Promise(r=>setTimeout(r,3000))
await p.evaluate(()=>{ window.__by = {} })
await new Promise(r=>setTimeout(r,2000))
const by = await p.evaluate(()=>window.__by)
for (const [k,n] of Object.entries(by).sort((a,z)=>z[1]-a[1])) console.log(String(Math.round(n/2)).padStart(4)+"/s  "+k)
await b.close()
