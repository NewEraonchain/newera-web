import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const ok = (n, p, extra = "") => console.log(`${p ? "PASS" : "FAIL"}  ${n}${extra ? "  — " + extra : ""}`)

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })

/* 1. A stationary reader must stay put and keep the row under their cursor. */
{
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.goto(`http://localhost:${PORT}/app`, { waitUntil: "networkidle2", timeout: 60000 })
  await wait(4000)
  await p.mouse.move(700, 450)
  /* Walk down until tape rows are actually in view. A fixed number of wheel
     steps is not reliable — the "Getting traded" section's height depends on
     live data, so the same scrollY lands in a different section run to run. */
  for (let i = 0; i < 90; i++) {
    const inView = await p.evaluate(
      () =>
        [...document.querySelectorAll(".scan-row")].filter((n) => {
          const r = n.getBoundingClientRect()
          return r.top > 80 && r.bottom < window.innerHeight
        }).length
    )
    if (inView >= 2) break
    await p.mouse.wheel({ deltaY: 120 })
    await wait(16)
  }
  await wait(1500)

  // Identify the tape row under the cursor by its own address, not by page
  // text — falling back to an ancestor's innerText picked up the live figures
  // at the top of the document and reported them as the row changing.
  // The first tape row visible in the viewport, identified by its token link.
  // elementFromPoint at a fixed y is unreliable — that point may sit in a gap
  // between sections, which is what made this probe return null.
  const rowAt = () =>
    p.evaluate(() => {
      // Any row — a cluster row links to /app/theme/:slug, a tape row to the
      // explorer. The guarantee is the same either way: whatever the reader is
      // looking at must still be there.
      const row = [...document.querySelectorAll(".scan-row")].find((n) => {
        const r = n.getBoundingClientRect()
        return r.top > 80 && r.bottom < window.innerHeight
      })
      // A cluster row IS the anchor (<Link className="scan-row">); a tape row
      // contains one. Handle both.
      if (!row) return null
      const a = row.matches("a") ? row : row.querySelector("a")
      return a?.getAttribute("href") || null
    })

  const y0 = await p.evaluate(() => Math.round(window.scrollY))
  const r0 = await rowAt()
  await wait(105000) // longer than eight poll cycles
  const y1 = await p.evaluate(() => Math.round(window.scrollY))
  const r1 = await rowAt()

  const drift = Math.abs(y1 - y0)
  ok("1a reader does not drift", drift <= 8, `${y0} -> ${y1} (${drift}px)`)
  ok("1b row under cursor is unchanged", !!r0 && r0 === r1, `${r0} -> ${r1}`)

  /* The pill is only owed when the index actually moved on. Asking the API
     directly distinguishes "updates were wrongly applied / wrongly withheld"
     from "the chain was quiet for 105 seconds", which is otherwise
     indistinguishable and made this check flap. */
  const pill = await p.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((n) => /show \d+ new/i.test(n.innerText))
    return btn ? btn.innerText.replace(/\s+/g, " ").trim() : null
  })
  const rendered = await p.evaluate(() =>
    [...document.querySelectorAll('a[href*="/token/"]')].map((a) => a.getAttribute("href").split("/").pop().toLowerCase())
  )
  const fresh = await (await fetch("https://newerabackend-production.up.railway.app/intel/feed?limit=30")).json()
  const newOnes = fresh.items.filter((l) => !rendered.includes(l.address.toLowerCase())).length
  ok(
    "1c held updates are offered when owed",
    newOnes === 0 ? pill === null : !!pill,
    `${newOnes} unseen upstream; pill=${pill || "none"}`
  )

  // Taking the update must actually apply it.
  if (pill) {
    await p.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((n) => /show \d+ new/i.test(n.innerText))
      btn?.click()
    })
    await wait(1200)
    const after = await p.evaluate(() => ({
      stillThere: [...document.querySelectorAll("button")].some((n) => /show \d+ new/i.test(n.innerText)),
      first: document.querySelector('a[href*="/token/"]')?.getAttribute("href") || null,
    }))
    ok("1d taking the update clears the pill", !after.stillThere)
    ok("1d2 taking the update changes the list", after.first !== r0, `${r0} -> ${after.first}`)
  } else {
    console.log("SKIP  1d — nothing was held (index quiet)")
  }
  await p.close()
}

/* 2. Feed -> cluster -> Back must return you to where you were. */
{
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.goto(`http://localhost:${PORT}/app`, { waitUntil: "networkidle2", timeout: 60000 })
  await p.evaluate(() => localStorage.setItem("newera_onboard_declined", String(Date.now())))
  await p.reload({ waitUntil: "networkidle2" })
  await wait(4000)
  await p.mouse.move(700, 450)
  for (let i = 0; i < 22; i++) { await p.mouse.wheel({ deltaY: 120 }); await wait(16) }
  await wait(1200)
  const before = await p.evaluate(() => Math.round(window.scrollY))

  const went = await p.evaluate(() => {
    const a = [...document.querySelectorAll('a[href^="/app/theme/"]')][0]
    if (!a) return null
    a.click()
    return a.getAttribute("href")
  })
  await wait(3500)
  const onDetail = await p.evaluate(() => ({ y: Math.round(window.scrollY), path: location.pathname }))
  ok("2a cluster opens at the top", onDetail.y < 40, `${went} at y=${onDetail.y}`)

  await p.goBack({ waitUntil: "networkidle2" })
  // The restore legitimately converges while the document grows, so "settled"
  // is sampled after that window — the failure being guarded against is drift
  // AFTER it settles, which is what used to carry the reader 2,700px away.
  await wait(5000)
  const settled = await p.evaluate(() => Math.round(window.scrollY))
  await wait(5000)
  const later = await p.evaluate(() => Math.round(window.scrollY))

  ok("2b Back restores the position", Math.abs(settled - before) <= 120, `left ${before}, back at ${settled}`)
  ok("2c stays put once settled", Math.abs(later - settled) <= 8, `${settled} -> ${later}`)
  await p.close()
}

await b.close()
