import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const SLUG = process.argv[3] || "doge-2"
const ROUTES = [
  "/", "/app", `/app/theme/${SLUG}`, "/how-it-works", "/detection", "/themes",
  "/docs", "/about", "/contact", "/account", "/terms", "/privacy", "/risk",
  "/this-route-does-not-exist",
]

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const findings = []
const add = (route, kind, detail) => findings.push({ route, kind, detail })

for (const route of ROUTES) {
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  const consoleErrors = []
  p.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 120)))
  p.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 120)))

  try {
    await p.goto(`http://localhost:${PORT}${route}`, { waitUntil: "networkidle2", timeout: 60000 })
  } catch {
    add(route, "load", "navigation timed out")
    await p.close()
    continue
  }
  await wait(2600)

  const r = await p.evaluate(() => {
    const out = {
      title: document.title,
      h1: [...document.querySelectorAll("h1")].map((h) => h.innerText.replace(/\s+/g, " ").slice(0, 50)),
      headingOrder: [],
      namelessControls: [],
      deadLinks: [],
      externalNoRel: [],
      smallTargets: [],
      inputsNoLabel: [],
      imgsNoAlt: [],
      internalLinks: [],
      interactive: 0,
      bodyText: document.body.innerText.replace(/\s+/g, " ").length,
    }

    // Heading hierarchy.
    let last = 0
    for (const h of document.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
      const lvl = Number(h.tagName[1])
      if (last && lvl > last + 1)
        out.headingOrder.push(`h${last} -> h${lvl}: "${h.innerText.slice(0, 30)}"`)
      last = lvl
    }

    const name = (el) =>
      (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || "")
        .replace(/\s+/g, " ")
        .trim()

    for (const el of document.querySelectorAll("a,button,[role='button'],input,select,textarea")) {
      const rect = el.getBoundingClientRect()
      const visible = rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden"
      if (!visible) continue
      out.interactive++

      const tag = el.tagName.toLowerCase()
      const label = name(el)

      if (tag !== "input" && tag !== "select" && tag !== "textarea" && !label)
        out.namelessControls.push(`${tag}${el.className ? "." + String(el.className).split(" ")[0] : ""}`)

      /* Touch target size — 44px is the usual floor; 24px is the WCAG 2.2
         minimum. That success criterion exempts a target that is INLINE in a
         sentence, because its size is constrained by the surrounding
         line-height and padding it out would break the paragraph. Reporting
         those anyway produced 30 findings of which 28 were prose links, which
         is how the two real ones sat unfixed for weeks: a suite that cries
         wolf gets skimmed. A link alone in its own block has no such excuse
         and is still reported. */
      if ((rect.width < 24 || rect.height < 24) && label) {
        const block = el.closest("p,li,td,th,dd,dt,h1,h2,h3,figcaption")
        const blockText = block ? block.innerText.trim().replace(/\s+/g, " ") : ""
        const inlineInSentence = !!block && blockText.length > label.trim().length + 3
        if (!inlineInSentence)
          out.smallTargets.push(`${label.slice(0, 24)} (${Math.round(rect.width)}x${Math.round(rect.height)})`)
      }

      if (tag === "a") {
        const href = el.getAttribute("href") || ""
        if (!href || href === "#") out.deadLinks.push(label.slice(0, 30) || "(unnamed)")
        else if (/^https?:\/\//.test(href)) {
          const rel = el.getAttribute("rel") || ""
          if (el.target === "_blank" && !/noopener|noreferrer/.test(rel))
            out.externalNoRel.push(href.slice(0, 50))
        } else if (href.startsWith("/")) out.internalLinks.push(href)
      }

      if (tag === "input" || tag === "textarea") {
        const id = el.id
        const labelled =
          (id && document.querySelector(`label[for="${id}"]`)) ||
          el.closest("label") ||
          el.getAttribute("aria-label") ||
          el.getAttribute("aria-labelledby") ||
          el.getAttribute("placeholder")
        if (!labelled) out.inputsNoLabel.push(el.type || "text")
      }
    }

    for (const img of document.querySelectorAll("img")) {
      if (!img.hasAttribute("alt")) out.imgsNoAlt.push(img.src.slice(-40))
    }
    return out
  })

  if (!r.title || r.title.length < 5) add(route, "title", `weak document title: "${r.title}"`)
  if (r.h1.length === 0) add(route, "heading", "no h1 on the page")
  if (r.h1.length > 1) add(route, "heading", `${r.h1.length} h1 elements: ${JSON.stringify(r.h1)}`)
  for (const h of r.headingOrder) add(route, "heading-order", h)
  for (const c of [...new Set(r.namelessControls)]) add(route, "nameless-control", c)
  for (const d of [...new Set(r.deadLinks)]) add(route, "dead-link", d)
  for (const e of [...new Set(r.externalNoRel)]) add(route, "external-no-rel", e)
  for (const s of [...new Set(r.smallTargets)].slice(0, 6)) add(route, "small-target", s)
  for (const i of [...new Set(r.inputsNoLabel)]) add(route, "input-no-label", i)
  for (const i of [...new Set(r.imgsNoAlt)]) add(route, "img-no-alt", i)
  if (consoleErrors.length) add(route, "console-error", [...new Set(consoleErrors)].slice(0, 2).join(" | "))

  // Keyboard: can we reach the main content, and is focus ever invisible?
  const kb = await p.evaluate(async () => {
    const seen = []
    let invisibleFocus = 0
    for (let i = 0; i < 24; i++) {
      const el = document.activeElement
      if (el && el !== document.body) {
        const s = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        const hasRing = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0
        if (!hasRing && r.width > 0) invisibleFocus++
        seen.push((el.getAttribute("aria-label") || el.innerText || el.tagName).replace(/\s+/g, " ").slice(0, 22))
      }
      break
    }
    return { seen, invisibleFocus }
  })

  // Real tabbing has to be driven from the harness, not the page.
  let noRing = 0
  const tabbed = []
  for (let i = 0; i < 18; i++) {
    await p.keyboard.press("Tab")
    const info = await p.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return {
        label: (el.getAttribute("aria-label") || el.innerText || el.tagName).replace(/\s+/g, " ").slice(0, 26),
        ring: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0,
        onScreen: r.width > 0 && r.height > 0,
        inViewport: r.top >= -5 && r.top < window.innerHeight,
      }
    })
    if (!info) continue
    tabbed.push(info.label)
    if (info.onScreen && !info.ring) noRing++
  }
  if (noRing > 0) add(route, "focus-invisible", `${noRing} of ${tabbed.length} tabbed controls draw no focus ring`)
  void kb

  // Horizontal overflow on a phone.
  await p.setViewport({ width: 390, height: 844 })
  await wait(900)
  const ov = await p.evaluate(() => {
    const de = document.documentElement
    const over = de.scrollWidth - de.clientWidth
    let culprit = null
    if (over > 1) {
      for (const el of document.querySelectorAll("*")) {
        const r = el.getBoundingClientRect()
        if (r.right > de.clientWidth + 2 && r.width > 40) {
          culprit = el.tagName.toLowerCase() + "." + String(el.className || "").split(" ").slice(0, 2).join(".")
          break
        }
      }
    }
    return { over, culprit }
  })
  if (ov.over > 1) add(route, "mobile-overflow", `${ov.over}px horizontal scroll at 390px — ${ov.culprit}`)

  await p.close()
}

// ── Report ────────────────────────────────────────────────────────────────
const byKind = {}
for (const f of findings) (byKind[f.kind] ||= []).push(f)
console.log(`\n${findings.length} findings across ${ROUTES.length} routes\n`)
for (const [kind, list] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`── ${kind} (${list.length})`)
  for (const f of list.slice(0, 8)) console.log(`   ${f.route.padEnd(24)} ${f.detail}`)
  if (list.length > 8) console.log(`   ... and ${list.length - 8} more`)
}
await b.close()
