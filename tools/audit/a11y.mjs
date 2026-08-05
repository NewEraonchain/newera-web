/* What a screen reader and a keyboard actually get.
 *
 * Every check here failed when it was written. The pattern in all of them is
 * the same: work that was done — plain-language flag explanations, risk tiers,
 * swap failure messages — was attached to the page in a way that reaches a
 * sighted mouse user and nobody else. `aria-label` on a `<span>` is the worst
 * offender: it looks like accessibility work in the source and is discarded
 * outright by NVDA, JAWS and Chrome's own accessibility tree, because a bare
 * span has the generic role and generic elements take no name.
 *
 * Run against the dev server: node tools/audit/a11y.mjs [port]
 */
import puppeteer from "puppeteer-core"

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const PORT = process.argv[2] || "5173"
const BASE = `http://localhost:${PORT}`
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
let fail = 0
const ok = (name, detail = "") => {
  pass++
  console.log(`  PASS  ${name}${detail ? `  — ${detail}` : ""}`)
}
const bad = (name, detail = "") => {
  fail++
  console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ""}`)
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const open = async (route) => {
  const p = await browser.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.goto(BASE + route, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {})
  return p
}

/* ── 1. the keyboard gets in ──────────────────────────────────────────── */
console.log("\n1. the keyboard reaches the content")
{
  const p = await open("/app")
  await p.keyboard.press("Tab")
  const first = await p.evaluate(() => {
    const a = document.activeElement
    return { tag: a?.tagName, text: a?.textContent?.trim().slice(0, 40), href: a?.getAttribute("href") }
  })
  if (first.href === "#main") ok("the first tab stop is the skip link", first.text)
  else bad("the first tab stop is the skip link", `got ${first.tag} "${first.text}"`)

  // It has to be visible once focused, or it is a trap nobody can see.
  const shown = await p.evaluate(() => {
    const a = document.activeElement
    const r = a.getBoundingClientRect()
    return r.width > 40 && r.height > 20 && r.top >= 0
  })
  shown ? ok("it becomes visible when focused") : bad("it becomes visible when focused")

  // And the target must actually take focus, or the next Tab resumes at the nav.
  await p.keyboard.press("Enter")
  await wait(150)
  const landed = await p.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)
  landed === "main" ? ok("activating it moves focus into main") : bad("activating it moves focus into main", String(landed))
  await p.close()
}

/* ── 2. names that were attached to generic elements ──────────────────── */
console.log("\n2. the labels reach the accessibility tree")
{
  const p = await open("/app")
  await wait(2500)

  /* Chrome's own computed name, not the attribute. This is the check that
     catches `aria-label` on a span: the attribute is present in the DOM and
     absent from the tree. */
  const snap = await p.accessibility.snapshot({ interestingOnly: false })
  const flat = []
  const walk = (n) => {
    if (!n) return
    flat.push(n)
    ;(n.children || []).forEach(walk)
  }
  walk(snap)
  const text = flat.map((n) => `${n.name || ""} ${n.value || ""}`).join(" | ")

  text.includes("spam risk")
    ? ok("a risk score announces its tier", '"out of 100 spam risk" is in the tree')
    : bad("a risk score announces its tier", "the tier never reaches the tree")

  const flagged = /invisible characters|lookalike letters|already used by a recent launch|near-identical name|mixes alphabets/i.test(text)
  flagged
    ? ok("a spam flag announces what it means")
    : bad("a spam flag announces what it means", "no FLAG_TEXT sentence in the tree")

  await p.close()
}

/* ── 3. the search says what it found ─────────────────────────────────── */
console.log("\n3. the search announces its results")
{
  const p = await open("/app")
  await wait(1500)
  await p.click("#feed-search")
  await p.type("#feed-search", "ai", { delay: 30 })
  await wait(1400)
  const r = await p.evaluate(() => {
    const i = document.getElementById("feed-search")
    const live = [...document.querySelectorAll("[aria-live]")].map((n) => n.textContent.trim())
    return {
      role: i.getAttribute("role"),
      expanded: i.getAttribute("aria-expanded"),
      controls: i.getAttribute("aria-controls"),
      listExists: !!document.getElementById(i.getAttribute("aria-controls") || "__none"),
      live,
    }
  })
  r.role === "combobox" && r.expanded === "true"
    ? ok("the field reports that a list opened")
    : bad("the field reports that a list opened", JSON.stringify(r))
  r.listExists ? ok("aria-controls points at the real list") : bad("aria-controls points at the real list")
  const said = r.live.find((t) => /match|Searching|No matches|did not answer/.test(t))
  said ? ok("a live region counts the results", said.slice(0, 60)) : bad("a live region counts the results", JSON.stringify(r.live))
  await p.close()
}

/* ── 4. tables introduce themselves ───────────────────────────────────── */
console.log("\n4. every table has a caption")
{
  for (const route of ["/app", "/app/theme/tread-fi"]) {
    const p = await open(route)
    await wait(2500)
    const r = await p.evaluate(() =>
      [...document.querySelectorAll("table")].map((t) => ({
        cap: t.querySelector("caption")?.textContent?.trim().slice(0, 40) || null,
        rows: t.querySelectorAll("tbody tr").length,
      }))
    )
    const missing = r.filter((t) => !t.cap)
    if (!r.length) console.log(`  note: ${route} rendered no table`)
    else if (missing.length) bad(`${route}: all ${r.length} tables captioned`, `${missing.length} without`)
    else ok(`${route}: all ${r.length} tables captioned`)
    await p.close()
  }
}

/* ── 5. links are told apart by their names ───────────────────────────── */
console.log("\n5. no link is named by a glyph alone")
{
  const p = await open("/app")
  await wait(2000)
  const junk = await p.evaluate(() => {
    const out = []
    for (const a of document.querySelectorAll("a, button")) {
      const name = (a.getAttribute("aria-label") || a.textContent || "").replace(/\s+/g, " ").trim()
      // A name that is only arrows, punctuation or a single character tells a
      // reader listing the page's links nothing at all.
      if (!name || /^[\u2190-\u21FF\u2B00-\u2BFF\W_]{1,3}$/u.test(name)) {
        out.push(`${a.tagName} "${name}" @${a.getAttribute("href") || "button"}`)
      }
    }
    return out.slice(0, 6)
  })
  junk.length === 0 ? ok("every control has a name worth reading") : bad("every control has a name worth reading", junk.join(" · "))
  await p.close()
}

/* ── 6. the money screen speaks ───────────────────────────────────────── */
console.log("\n6. the swap panel announces what happened")
{
  const p = await open("/app")
  await wait(2500)
  /* A TRADABLE token, not the first row. Most launches have no pool, and on
     those the panel is a handoff to the venue with nothing to announce — which
     is correct, and would have let this check pass by testing the wrong page.
     The "Getting traded" section is the one that only lists routable markets. */
  const hrefs = await p.evaluate(() => {
    const heads = [...document.querySelectorAll("h2")]
    const traded = heads.find((h) => /getting traded/i.test(h.textContent || ""))
    const scope = traded?.closest("section") || document
    return [...new Set([...scope.querySelectorAll('a[href*="/app/token/"]')].map((a) => a.getAttribute("href")))].slice(0, 6)
  })
  await p.close()
  if (!hrefs.length) {
    console.log("  note: no token row to open — skipped")
  } else {
    /* Having a market and being routable in-app are different things — a v3
       pool quoted against something other than WETH is real and unreachable
       from here — so walk the candidates until one renders a live panel. What
       was tried is printed either way; a check that quietly settles for the
       handoff page would report green on a screen it never opened. */
    let panel = null
    let tried = 0
    for (const href of hrefs) {
      const t = await open(href)
      await wait(4500)
      const r = await t.evaluate(() => ({
        live: document.querySelectorAll("[aria-live], [role='status'], [role='alert']").length,
        routable: document.querySelectorAll("[aria-pressed]").length > 0,
        group: !!document.querySelector("[role='group'][aria-labelledby], [role='group'][aria-label]"),
        pressed: document.querySelectorAll("[aria-pressed]").length,
        small: [...document.querySelectorAll("[aria-pressed]")]
          .map((b) => b.getBoundingClientRect())
          .filter((b) => b.height < 24 || b.width < 24)
          .map((b) => `${Math.round(b.width)}x${Math.round(b.height)}`),
      }))
      tried++
      // Every token page must announce SOMETHING — at minimum the routing
      // verdict, which replaces a panel that was still deciding.
      r.live > 0
        ? ok(`${href.slice(-8)}: the page has a live region`, `${r.live}`)
        : bad(`${href.slice(-8)}: the page has a live region`, "the page changes in silence")
      await t.close()
      if (r.routable) {
        panel = r
        break
      }
    }
    if (!panel) {
      console.log(`  note: ${tried} traded tokens opened, none routable in-app — panel checks not run`)
    } else {
      panel.group ? ok("the slippage buttons are a labelled group") : bad("the slippage buttons are a labelled group")
      ok("the selected slippage is exposed", `${panel.pressed} with aria-pressed`)
      // 24px is the WCAG 2.2 floor, and these sit above the button that spends money.
      panel.small.length === 0
        ? ok("they clear the 24px target floor")
        : bad("they clear the 24px target floor", panel.small.join(" "))
    }
  }
}

await browser.close()
console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
