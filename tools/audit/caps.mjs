import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = process.argv[2] || "5173"

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
await p.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle2", timeout: 90000 })
await wait(3500)

console.log(
  JSON.stringify(
    await p.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll("*")) {
        const s = getComputedStyle(el)
        if (s.textTransform !== "uppercase") continue
        // Own text only, the way a detector counts a leaf.
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join("")
          .trim()
        if (own.length < 25 || own.length > 45) continue
        out.push({
          tag: el.tagName.toLowerCase(),
          len: own.length,
          fs: s.fontSize,
          fw: s.fontWeight,
          txt: own.slice(0, 40),
          cls: String(el.className || "").slice(0, 60),
        })
      }
      return out
    }),
    null,
    2
  )
)
await b.close()
