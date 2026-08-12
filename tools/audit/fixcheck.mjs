import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const U = (r) => `http://localhost:${PORT}${r}`
const ok = (n, p, extra = "") => console.log(`${p ? "PASS" : "FAIL"}  ${n}${extra ? "  — " + extra : ""}`)

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })

/* A. DexScreener down must not become a claim about the tokens. */
{
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.setRequestInterception(true)
  p.on("request", (r) => (r.url().includes("dexscreener.com") ? r.abort() : r.continue()))
  await p.goto(U("/app"), { waitUntil: "networkidle2", timeout: 60000 })
  await wait(6000)
  const t = await p.evaluate(() => document.body.innerText)
  ok("A1 dex down -> says unavailable", /unavailable right now|Market data is unavailable/i.test(t))
  ok("A2 dex down -> does NOT claim 'nobody can trade'", !/Nobody can trade this/i.test(t))
  await p.close()
}

/* B. A cold API outage must explain itself, not pulse forever. */
{
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.setRequestInterception(true)
  p.on("request", (r) => (r.url().includes("railway.app") ? r.abort() : r.continue()))
  await p.goto(U("/app"), { waitUntil: "domcontentloaded", timeout: 60000 })
  await wait(16000)
  const r = await p.evaluate(() => ({
    text: document.body.innerText,
    skeletons: document.querySelectorAll(".animate-pulse").length,
  }))
  ok("B1 api down -> explains itself", /not responding|not answering/i.test(r.text), `${r.skeletons} skeletons`)
  ok("B2 api down -> no false 'no cluster' claim", !/No cluster right now has independent/i.test(r.text))
  await p.close()
}

/* C. A drifted field must not empty the document. */
{
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  await p.setRequestInterception(true)
  /* Two poisons. `samples` as a string is now guarded by Array.isArray, so it
     must render normally; `duplicatePct` as an object is unguarded and React
     cannot render it, which is what proves the boundary still catches a real
     throw. The CORS header is required or the browser blocks the injected
     cross-origin response and the app just sees a network failure. */
  p.on("request", async (r) => {
    const headers = { "Access-Control-Allow-Origin": "*" }
    if (r.url().includes("/intel/themes")) {
      return r.respond({
        status: 200, contentType: "application/json", headers,
        body: JSON.stringify({ items: [{ id: "x", slug: "x", label: "X", launchCount: 4, creatorCount: 2, ageMinutes: 5, status: "EMERGING", isOrganic: true, samples: "not-an-array" }] }),
      })
    }
    if (r.url().includes("/intel/stats")) {
      return r.respond({
        status: 200, contentType: "application/json", headers,
        body: JSON.stringify({ launchesLastHour: 1, launchesLast24h: 1, activeThemes: 1, distinctCreators24h: 1, duplicatePct: { bad: true }, highRiskPct: 1, indexedThroughBlock: "1", lastIngestAt: new Date().toISOString() }),
      })
    }
    r.continue()
  })
  await p.goto(U("/app"), { waitUntil: "networkidle2", timeout: 60000 })
  await wait(5000)
  const r = await p.evaluate(() => ({
    kids: document.getElementById("root")?.children.length ?? 0,
    text: document.body.innerText,
    /* Rows, not headings. The old assertion below looked for the section
       titles of a three-tab layout that no longer exists, so it failed for the
       best possible reason — the tabs became one sortable table. What "the
       page still works" means is that the tape rendered, which is a row count
       and survives any amount of copy editing. */
    rows: document.querySelectorAll("tbody tr").length,
  }))
  ok("C1 unrenderable field -> page not blank", r.kids > 0, `root children=${r.kids}`)
  /* This used to assert the error boundary caught a crash. The feed no longer
     crashes on this input — the figure strip validates every stat — so the
     boundary is never reached, and asserting on its copy would fail for the
     best possible reason. What matters now is that a field which is not a
     number is never DRAWN as one: it rendered a literal "[object Object]%" on
     the surface whose whole claim is that its figures are real. */
  ok("C2 garbage stat is not rendered as a measurement",
     !/\[object Object\]/.test(r.text) && !/NaN|undefined%/.test(r.text),
     r.text.match(/[^ ]*(COPY OR IMPERSONATION)/)?.[0] || "no stat row found")
  ok("C2b the page still works around it", r.rows > 0, `${r.rows} rows on the tape`)
  await p.close()
}

/* D. Onboarding: one event, no decline on self-open, focus restored, header syncs. */
{
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  const shown = []
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    if (r.url().includes("/onboarding/event")) {
      try {
        const b = JSON.parse(r.postData() || "{}")
        if (b.step === "MODAL_SHOWN") shown.push(b.meta?.source ?? "(none)")
      } catch { /* ignore */ }
    }
    r.continue()
  })
  await p.goto(U("/app"), { waitUntil: "networkidle2", timeout: 60000 })
  await p.evaluate(() => localStorage.clear())
  await p.reload({ waitUntil: "networkidle2" })
  await wait(2500)

  await p.evaluate(() => {
    const el = [...document.querySelectorAll("header button, header a")].find((n) => /get started/i.test(n.innerText || ""))
    el?.focus(); el?.click()
  })
  await wait(1500)
  ok("D1 MODAL_SHOWN fires once", shown.length === 1, JSON.stringify(shown))

  await p.keyboard.press("Escape")
  await wait(900)
  const after = await p.evaluate(() => ({
    declined: !!localStorage.getItem("newera_onboard_declined"),
    focus: document.activeElement?.innerText?.replace(/\s+/g, " ").trim().slice(0, 20) || document.activeElement?.tagName,
  }))
  ok("D2 self-open dismiss does NOT decline", after.declined === false)
  ok("D3 focus restored to opener", /get started/i.test(after.focus || ""), `focus=${after.focus}`)

  // Header must flip without a reload.
  await p.evaluate(() => {
    localStorage.setItem("newera_onboarded", "1")
    window.dispatchEvent(new CustomEvent("newera:onboarded"))
  })
  await wait(600)
  const nav = await p.evaluate(() =>
    [...document.querySelectorAll("header a, header button")].map((n) => n.innerText.replace(/\s+/g, " ").trim()).filter((t) => /get started|account/i.test(t))
  )
  ok("D4 header syncs without reload", nav.some((t) => /account/i.test(t)), JSON.stringify(nav))
  await p.close()
}

await b.close()
