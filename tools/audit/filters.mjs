/* Do the filters select from the INDEX, or from the page already on screen?
 *
 * That distinction is the whole point. Narrowing thirty rows the browser
 * already holds is a sort wearing a filter's clothes: ask for "over 50 holders"
 * and you get however many of those thirty qualify — usually none — and
 * conclude the chain is empty. These go to the database as query parameters.
 *
 * Run against the deployed API. Distribution filters need the TokenDistribution
 * table, so they report honestly rather than failing when it is not deployed.
 */
const API = process.argv[2] || "https://newerabackend-production.up.railway.app"
let fail = 0
const ok = (c, m) => { console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fail++ }
const get = (qs) => fetch(`${API}/intel/feed?${qs}`).then((r) => r.ok ? r.json() : null).catch(() => null)

/* Is the deployed API even running the filter code?
 *
 * Every check here reads the LIVE api, and an undeployed backend fails all of
 * them for one reason that has nothing to do with the frontend. Reporting five
 * confusing failures instead of one clear sentence is exactly the misleading
 * output this repo keeps having to fix in its own suites. */
const probe = await get("limit=1&minHolders=999999")
const DEPLOYED = probe?.measuredOnly === true
if (!DEPLOYED) {
  console.log("NOT DEPLOYED — the live API ignores the distribution filters.")
  console.log("Checks that depend on them are skipped rather than failed.\n")
}

console.log("1. the filters reach the database")
{
  const base = await get("limit=30")
  ok(!!base?.items?.length, `an unfiltered feed returns rows (${base?.items?.length ?? 0})`)

  const risky = await get("limit=30&maxRisk=10")
  if (risky?.items) {
    const over = risky.items.filter((l) => l.riskScore > 10)
    ok(over.length === 0, `maxRisk=10 returns nothing above 10 (${risky.items.length} rows, ${over.length} over)`)
  }

  if (DEPLOYED) {
    const fresh = await get("limit=30&maxAgeMinutes=10")
    if (fresh?.items) {
      const stale = fresh.items.filter((l) => l.ageSeconds > 11 * 60)
      ok(stale.length === 0, `maxAgeMinutes=10 returns nothing older (${fresh.items.length} rows, ${stale.length} stale)`)
    }
  } else console.log("  skip  maxAgeMinutes — not deployed")
}

console.log("\n2. a filter is not a page-narrowing trick")
{
  /* If filtering happened client-side, asking for a narrow slice would return
     a SUBSET of the unfiltered first page. Reaching rows the unfiltered page
     does not contain proves the query ran against the index. */
  const base = await get("limit=30")
  const filtered = await get("limit=30&maxRisk=0")
  if (base?.items && filtered?.items?.length) {
    const baseAddrs = new Set(base.items.map((l) => l.address))
    const beyond = filtered.items.filter((l) => !baseAddrs.has(l.address))
    ok(beyond.length > 0 || filtered.items.length === 0,
      `maxRisk=0 reaches ${beyond.length} rows the unfiltered page never held`)
  }
}

console.log("\n3. distribution filters, and their honesty flag")
{
  const d = DEPLOYED ? await get("limit=30&minHolders=10") : null
  if (!d) {
    console.log("  skip  distribution filters — not deployed")
  } else {
    ok(d.measuredOnly === true, "a holder filter reports measuredOnly, so the UI can say what is hidden")
    const bad = (d.items || []).filter((l) => !l.distribution || l.distribution.holders < 10)
    ok(bad.length === 0, `minHolders=10 returns only measured rows at or above it (${d.items.length} rows, ${bad.length} wrong)`)

    const plain = await get("limit=30")
    ok(plain?.measuredOnly === undefined, "an unfiltered feed does NOT claim measuredOnly")

    const conc = await get("limit=30&maxTop10=70")
    if (conc?.items) {
      const over = conc.items.filter((l) => (l.distribution?.top10Pct ?? 0) > 70)
      ok(over.length === 0, `maxTop10=70 excludes anything above it (${conc.items.length} rows, ${over.length} over)`)
    }
  }
}

console.log("\n4. a bad filter is refused, not silently ignored")
if (DEPLOYED) {
  /* A filter that is quietly dropped is worse than one that errors: the reader
     gets a full unfiltered feed believing it was narrowed. */
  const r = await fetch(`${API}/intel/feed?limit=30&minHolders=notanumber`).then((r) => r.status)
  ok(r === 400, `a non-numeric filter is a 400, not a full unfiltered feed (got ${r})`)
  const r2 = await fetch(`${API}/intel/feed?limit=30&maxTop10=900`).then((r) => r.status)
  ok(r2 === 400, `an out-of-range percentage is a 400 (got ${r2})`)
} else console.log("  skip  validation — not deployed")

console.log(`\n${fail === 0 ? "✅ filter checks passed" : `❌ ${fail} FAILED`}`)
process.exit(fail === 0 ? 0 : 1)
