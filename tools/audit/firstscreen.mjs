/* What does a visitor actually SEE first, and how far must they scroll before
   anything advances their task?
 *
 * Reported faults this exists to catch, all the same shape: text before
 * substance, secondary content above primary, and the thing you came to do
 * buried below several screenfolds.
 *
 * It measures rather than judges: how much of the first viewport is prose, the
 * order of section headings down the page, and the y-position of the first
 * control that moves the visitor forward. */
import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BASE = process.argv[2] || "http://localhost:5173"

const feed = await fetch("https://newerabackend-production.up.railway.app/intel/feed?limit=5").then(r => r.json()).catch(() => ({ items: [] }))
const themes = await fetch("https://newerabackend-production.up.railway.app/intel/themes?limit=1").then(r => r.json()).catch(() => ({ items: [] }))
const token = feed.items?.[0]?.address
const slug = themes.items?.[0]?.slug

const ROUTES = [
  ["/", "landing"],
  ["/app", "feed"],
  slug ? [`/app/theme/${slug}`, "cluster"] : null,
  token ? [`/app/token/${token}`, "token"] : null,
  ["/how-it-works", "how-it-works"],
  ["/detection", "detection"],
  ["/themes", "themes"],
  ["/about", "about"],
  ["/docs", "docs"],
  ["/account", "account"],
].filter(Boolean)

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })

for (const [route, name] of ROUTES) {
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.goto(BASE + route, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {})
  await new Promise(r => setTimeout(r, 4500))

  const m = await p.evaluate(() => {
    const vh = window.innerHeight
    const abs = (el) => el.getBoundingClientRect().top + window.scrollY

    // Headings in document order, with how far down the page they sit.
    const heads = [...document.querySelectorAll("h1,h2")]
      .filter(h => h.offsetParent !== null && h.textContent.trim())
      .map(h => ({ t: h.textContent.trim().slice(0, 34), y: Math.round(abs(h)), tag: h.tagName }))

    /* Prose share of the first viewport: characters of running text sitting
       above the fold, against everything above the fold. A high number is the
       "a lot of texts rather than the feed" complaint, quantified. */
    let proseChars = 0, dataChars = 0
    for (const el of document.querySelectorAll("p,li,td,th,h1,h2,h3")) {
      const r = el.getBoundingClientRect()
      if (r.top > vh || r.bottom < 0 || !el.textContent.trim()) continue
      const n = el.textContent.trim().length
      if (el.tagName === "P" || el.tagName === "LI") proseChars += n
      else dataChars += n
    }

    // The first thing that moves you forward: a row link into a token, or a
    // trade control. Nav, footer and legal links do not count.
    const forward = [...document.querySelectorAll("a[href],button,input")].filter((el) => {
      if (el.offsetParent === null) return false
      if (el.closest("header,footer,nav")) return false
      const href = el.getAttribute("href") || ""
      // Any route into the app counts, including a plain "/app" call to action —
      // requiring /app/token/ or /app/theme/ reported every prose page as a dead
      // end when several of them do link into the feed.
      return /^\/app(\/|$)/.test(href) || el.id === "feed-search" ||
        el.id === "swap-amount" || /^(buy|sell)$/i.test(el.textContent.trim())
    })
    const firstForward = forward.length
      ? { y: Math.round(abs(forward[0])), what: (forward[0].getAttribute("href") || forward[0].textContent.trim()).slice(0, 40) }
      : null

    // How many rows of actual data are above the fold.
    const rowsAboveFold = [...document.querySelectorAll("tbody tr")].filter(r => r.getBoundingClientRect().top < vh).length

    return {
      vh,
      docH: document.documentElement.scrollHeight,
      heads,
      proseChars,
      dataChars,
      firstForward,
      rowsAboveFold,
      totalRows: document.querySelectorAll("tbody tr").length,
    }
  })

  const pct = m.proseChars + m.dataChars ? Math.round((m.proseChars / (m.proseChars + m.dataChars)) * 100) : 0
  console.log(`\n── ${name}  (${route})`)
  console.log(`   first viewport: ${pct}% prose  ·  ${m.rowsAboveFold}/${m.totalRows} data rows visible  ·  page ${m.docH}px`)
  console.log(`   first way forward: ${m.firstForward ? `y=${m.firstForward.y} (${(m.firstForward.y / m.vh).toFixed(1)} screens down) → ${m.firstForward.what}` : "NONE FOUND"}`)
  if (m.heads.length) {
    console.log(`   sections:`)
    for (const h of m.heads) console.log(`      ${String(h.y).padStart(6)}px  ${h.tag}  ${h.t}`)
  }
  await p.close()
}
await b.close()
