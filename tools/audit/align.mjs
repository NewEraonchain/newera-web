/* Does the masthead share a left edge with the content under it?
 *
 * The header was 4vw from the viewport and the content column was capped and
 * centred, so the two agreed only while the viewport was narrower than the cap.
 * Past ~1664px they walked apart — on a 2560px display the wordmark sat 102px
 * from the edge and the H1 under it sat 484px, which is the "content floating
 * in the middle" complaint in its purest form. */
import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const PORT = process.argv[2] || "5173"
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
/* Two families, on purpose. Operate routes take the `app` measure and must line
   up with the chrome exactly. Read routes take the reading measure and are
   centred inside it — narrower than the chrome by design — so the check there
   is that they all agree with EACH OTHER. `/account` used to belong to neither:
   a 54rem column nobody else used. */
const APP = ["/app", "/app/theme/tread-fi"]
const PROSE = ["/about", "/docs", "/account"]
let bad = 0
const proseEdge = new Map()
for (const route of [...APP, ...PROSE]) {
  for (const w of [1280, 1440, 1920, 2560, 3440]) {
    const p = await b.newPage()
    await p.setViewport({ width: w, height: 900 })
    await p.goto(`http://localhost:${PORT}${route}`, { waitUntil: "networkidle2" }).catch(() => {})
    const r = await p.evaluate(() => {
      const L = (el) => (el ? Math.round(el.getBoundingClientRect().left) : null)
      const mark = [...document.querySelectorAll("header a")].find((a) =>
        a.textContent.trim().startsWith("NewEra")
      )
      const foot = document.querySelector("footer a, footer span")
      return { mark: L(mark), h1: L(document.querySelector("h1")), foot: L(foot) }
    })
    await p.close()
    let ok, note
    if (APP.includes(route)) {
      const d = r.h1 === null || r.mark === null ? NaN : r.h1 - r.mark
      ok = Math.abs(d) <= 2
      note = ok ? "aligned to chrome" : `OFF CHROME BY ${d}`
    } else {
      /* A reading page's H1 either starts at the gutter or one label-column in
         — the editorial pages set their section labels in a 10rem rail, so
         their heading sits 208px past it. Anything else is a page on its own
         axis, which is exactly what /account was. */
      const d = r.h1 - r.mark
      ok = Math.abs(d) <= 2 || Math.abs(d - 208) <= 2
      note = ok ? `starts +${d} from chrome` : `OWN AXIS: +${d} from chrome`
    }
    if (!ok) bad++
    console.log(
      `${route.padEnd(24)} ${String(w).padStart(5)}  wordmark ${String(r.mark).padStart(4)}  h1 ${String(r.h1).padStart(4)}  footer ${String(r.foot).padStart(4)}  ${note}`
    )
  }
}
await b.close()
console.log(bad ? `\n${bad} misaligned` : "\nevery route shares the masthead's left edge")
