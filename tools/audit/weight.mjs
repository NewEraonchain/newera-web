/* What a visitor actually downloads, per route, from the production build.
 *
 * The chunk list in the build output is not the answer: 98 chunks totalling
 * 3MB tells you nothing about whether any given page pulls one of them. This
 * loads each route in a real browser against `vite preview` and adds up the
 * JavaScript that crossed the wire, then names the largest pieces — which is
 * how you find out that a wallet SDK nobody has asked for is in the entry.
 *
 *   npx vite preview --port 4174
 *   node tools/audit/weight.mjs 4174
 */
import puppeteer from "puppeteer-core"
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const PORT = process.argv[2] || "4174"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const kb = (n) => (n / 1024).toFixed(1) + "kB"

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new" })
const ROUTES = ["/", "/app", "/about", "/account", "/app/token/0x25dc2a47d6df17a4cbde5213289df5ee78e5f178"]

for (const route of ROUTES) {
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  const seen = new Map()
  p.on("response", async (r) => {
    if (r.request().resourceType() !== "script") return
    try {
      const buf = await r.buffer()
      seen.set(r.url().split("/").pop(), buf.length)
    } catch {}
  })
  await p.goto(`http://localhost:${PORT}${route}`, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {})
  await wait(2500)
  await p.close()

  const total = [...seen.values()].reduce((a, n) => a + n, 0)
  const top = [...seen.entries()].sort((a, z) => z[1] - a[1]).slice(0, 4)
  console.log(`\n${route}`)
  console.log(`  ${kb(total)} of JS across ${seen.size} files`)
  for (const [name, n] of top) console.log(`      ${kb(n).padStart(8)}  ${name}`)
}
await b.close()
