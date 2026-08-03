import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"
const SLUG = process.argv[3] || "doge-2"
const ok = (n, p, extra = "") => console.log(`${p ? "PASS" : "FAIL"}  ${n}${extra ? "  — " + extra : ""}`)

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const page = async () => {
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  return p
}

/* 1. Titles must distinguish routes — tabs, history and bookmarks were all
      identical across thirteen pages. */
{
  const routes = ["/", "/app", "/how-it-works", "/detection", "/themes", "/docs", "/about", "/contact", "/account", "/terms", "/privacy", "/risk"]
  const titles = []
  const p = await page()
  for (const r of routes) {
    await p.goto(`http://localhost:${PORT}${r}`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await wait(900)
    titles.push(await p.title())
  }
  const unique = new Set(titles)
  ok("1 every route has its own title", unique.size === routes.length, `${unique.size}/${routes.length} distinct`)

  // 2. A cluster page names the cluster.
  await p.goto(`http://localhost:${PORT}/app/theme/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await wait(3500)
  const t = await p.title()
  ok("2 cluster page titles itself", /Cluster · NewEra$/.test(t) && !/^NewEra ·/.test(t), t)

  // 3. A wrong URL says so, and offers a way out.
  await p.goto(`http://localhost:${PORT}/definitely-not-a-page`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await wait(1200)
  const nf = await p.evaluate(() => ({
    title: document.title,
    text: document.querySelector("main")?.innerText.replace(/\s+/g, " ") || "",
    links: [...(document.querySelector("main")?.querySelectorAll("a") || [])].map((a) => a.getAttribute("href")),
  }))
  ok("3a 404 does not say 'coming next'", !/coming next/i.test(nf.text), nf.text.slice(0, 60))
  ok("3b 404 offers a way onward", nf.links.length >= 2, JSON.stringify(nf.links))
  ok("3c 404 titles itself", /not found/i.test(nf.title), nf.title)
  await p.close()
}

/* 4. Social metadata, and an og:image that actually resolves — a missing one
      renders a broken slot rather than falling back to text. */
{
  const p = await page()
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await wait(800)
  const og = await p.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("meta[property^='og:'], meta[name^='twitter:']")].map((m) => [
        m.getAttribute("property") || m.getAttribute("name"),
        m.getAttribute("content"),
      ])
    )
  )
  ok("4a og/twitter tags present", !!og["og:title"] && !!og["og:description"] && !!og["twitter:card"], `${Object.keys(og).length} tags`)
  /* og:image is absolute now — Twitter and several other unfurlers will not
     resolve a root-relative path against the page URL. Fetch the local file it
     points at rather than gluing the absolute URL onto localhost, which built
     "http://localhost:5173https://neweraai.xyz/og.png" and hung. */
  const imgPath = new URL(og["og:image"], "https://neweraai.xyz").pathname
  ok("4a² og:image is absolute", /^https?:\/\//.test(og["og:image"]), og["og:image"])
  const res = await p.goto(`http://localhost:${PORT}${imgPath}`, { timeout: 30000 })
  ok("4b og:image resolves", res?.status() === 200, `${imgPath} -> HTTP ${res?.status()}`)
  await p.close()
}

/* 5. Windows High Contrast must leave a visible pointer. */
{
  const p = await page()
  const cdp = await p.createCDPSession()
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: "active" }] })
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 60000 })
  await wait(2500)
  await p.mouse.move(700, 420)
  await wait(600)
  const r = await p.evaluate(() => ({
    forced: matchMedia("(forced-colors: active)").matches,
    bodyCursor: getComputedStyle(document.body).cursor,
    reticleInstalled: document.documentElement.classList.contains("reticle-on"),
  }))
  ok("5 forced-colors keeps a real cursor", r.forced && r.bodyCursor !== "none" && !r.reticleInstalled, JSON.stringify(r))
  await p.close()
}

await b.close()
