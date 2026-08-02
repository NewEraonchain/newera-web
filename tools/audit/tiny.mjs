import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
await p.goto(`http://localhost:${process.argv[2] || "5173"}${process.argv[3] || "/app"}`, {
  waitUntil: "networkidle2",
  timeout: 60000,
})
await wait(3500)
console.log(
  JSON.stringify(
    await p.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll("*")) {
        const s = getComputedStyle(el)
        if (parseFloat(s.fontSize) > 11.5) continue
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join("")
          .trim()
        // Long enough to read as a sentence rather than a label.
        if (own.length < 22) continue
        out.push({
          tag: el.tagName.toLowerCase(),
          size: s.fontSize,
          len: own.length,
          txt: own.replace(/\s+/g, " ").slice(0, 60),
          cls: String(el.className || "").slice(0, 55),
        })
      }
      return out.slice(0, 10)
    }),
    null,
    2
  )
)
await b.close()
