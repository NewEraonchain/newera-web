import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const ok = (n, p, extra = "") => console.log(`${p ? "PASS" : "FAIL"}  ${n}${extra ? "  — " + extra : ""}`)

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })

const openMenu = async (p) => {
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll("header button")].find((n) => /index/i.test(n.innerText))
    btn?.click()
  })
  await wait(700)
}

/* 1. Landscape: every destination must be reachable. */
for (const [w, h] of [[667, 375], [568, 320]]) {
  const p = await b.newPage()
  await p.setViewport({ width: w, height: h, isMobile: true, hasTouch: true })
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2", timeout: 60000 })
  await wait(2000)
  await openMenu(p)

  const r = await p.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"][aria-label="Site index"]')
    if (!dlg) return { error: "overlay not found" }
    const before = dlg.scrollTop
    dlg.scrollTop = 9999
    const scrolled = dlg.scrollTop
    dlg.scrollTop = 0
    const items = [...dlg.querySelectorAll("a[href], button")].map((n) => {
      const b = n.getBoundingClientRect()
      return { t: n.innerText.replace(/\s+/g, " ").trim().slice(0, 18), top: Math.round(b.top), h: Math.round(b.height) }
    })
    return { canScroll: scrolled > before, items, clipped: items.filter((i) => i.top < 0).map((i) => i.t) }
  })
  ok(`1 ${w}x${h} every item reachable`, r.clipped?.length === 0 || r.canScroll, r.error || `clipped=${JSON.stringify(r.clipped)} scrollable=${r.canScroll}`)
  await p.close()
}

/* 2-5 at a normal phone size. */
{
  const p = await b.newPage()
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await p.goto(`http://localhost:${PORT}/app`, { waitUntil: "networkidle2", timeout: 60000 })
  await p.evaluate(() => localStorage.setItem("newera_onboard_declined", String(Date.now())))
  await p.reload({ waitUntil: "networkidle2" })
  await wait(2500)

  // 2. Tap target of the only nav control on a phone.
  const btn = await p.evaluate(() => {
    const n = [...document.querySelectorAll("header button")].find((x) => /index/i.test(x.innerText))
    const r = n?.getBoundingClientRect()
    return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null
  })
  ok("2 Index button clears 24px", !!btn && btn.w >= 24 && btn.h >= 24, btn ? `${btn.w}x${btn.h}` : "not found")

  // 3. Scroll lock actually holds against Lenis.
  await p.evaluate(() => window.scrollTo(0, 1200))
  await wait(600)
  const yBefore = await p.evaluate(() => Math.round(window.scrollY))
  await openMenu(p)
  /* Wheel only. A programmatic `window.scrollTo` is not a user action and no
     overlay can prevent it — measuring it conflates "the lock leaks" with "the
     browser did what it was told", which is what made this check ambiguous. The
     reported defect was a wheel over the overlay moving the page. */
  await p.mouse.move(195, 400)
  for (let i = 0; i < 10; i++) { await p.mouse.wheel({ deltaY: 300 }); await wait(30) }
  await wait(600)
  const yAfter = await p.evaluate(() => Math.round(window.scrollY))
  ok("3 wheel does not scroll behind menu", Math.abs(yAfter - yBefore) <= 8, `${yBefore} -> ${yAfter}`)

  // 4. Focus stays inside.
  const escaped = await p.evaluate(async () => {
    const dlg = document.querySelector('[role="dialog"][aria-label="Site index"]')
    return { inside: dlg?.contains(document.activeElement) ?? false }
  })
  let outside = 0
  for (let i = 0; i < 14; i++) {
    await p.keyboard.press("Tab")
    const isIn = await p.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"][aria-label="Site index"]')
      return dlg?.contains(document.activeElement) ?? false
    })
    if (!isIn) outside++
  }
  ok("4 focus is contained", escaped.inside && outside === 0, `startedInside=${escaped.inside} escapes=${outside}`)

  // 5. Escape closes it.
  await p.keyboard.press("Escape")
  await wait(600)
  const stillOpen = await p.evaluate(() => !!document.querySelector('[role="dialog"][aria-label="Site index"]'))
  ok("5 Escape closes the menu", !stillOpen)

  // 6. Scroll is handed back after closing — by wheel, the same way it was taken.
  await p.mouse.move(195, 400)
  for (let i = 0; i < 6; i++) { await p.mouse.wheel({ deltaY: 300 }); await wait(30) }
  await wait(700)
  const yFree = await p.evaluate(() => Math.round(window.scrollY))
  ok("6 scrolling resumes after close", yFree > yBefore + 200, `${yBefore} -> ${yFree}`)
  await p.close()
}

await b.close()
