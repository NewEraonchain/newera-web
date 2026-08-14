/* Single place that knows where the backend lives. */
export const API =
  (import.meta.env.VITE_NEWERA_API as string | undefined) ||
  "https://newerabackend-production.up.railway.app"

/* One read per URL, shared by everyone who asks for it.
 *
 * Components fetch what they need, which is the right way round — a page should
 * not have to know that three sections below it want the same tape. But nothing
 * was collapsing those asks, so mounting the landing page issued, measured:
 *
 *     10x  /intel/feed?limit=200
 *      4x  /intel/stats
 *      2x  /intel/themes?limit=120
 *      2x  /intel/separation
 *
 * Ten identical 200-row reads, in flight simultaneously, for one screen. This
 * is not a cache in the sense of serving stale data to save a request: it is a
 * two-second window in which the SAME url resolves to the SAME promise. Two
 * components mounting in one render pass get one network call; a poll two
 * seconds later is a fresh read, which is what a live index needs.
 *
 * Only successful GETs are held. A failure must never be replayed to a later
 * caller as though it were their own — the feed distinguishes "the index said
 * nothing" from "we could not reach the index", and serving a cached rejection
 * would blur exactly that line. */
const TTL_MS = 2000
const inFlight = new Map<string, { at: number; p: Promise<unknown> }>()

export async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  /* Only plain GETs are shared. Anything carrying a body, a method or auth
     headers is a different request even at the same URL. */
  const shareable = !init || (!init.method && !init.body && !init.headers)
  const hit = shareable ? inFlight.get(path) : undefined
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p as Promise<T>

  const p = (async () => {
    const res = await fetch(API + path, {
      ...init,
      headers: { accept: "application/json", ...(init?.headers || {}) },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  })()

  if (shareable) {
    inFlight.set(path, { at: Date.now(), p })
    // Drop a failure immediately so the next caller makes a real attempt.
    p.catch(() => inFlight.delete(path))
    if (inFlight.size > 64) {
      const cutoff = Date.now() - TTL_MS
      for (const [k, v] of inFlight) if (v.at < cutoff) inFlight.delete(k)
    }
  }
  return p as Promise<T>
}

export function authHeaders(): Record<string, string> {
  const t = localStorage.getItem("newera_token")
  return t
    ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` }
    : { "Content-Type": "application/json" }
}

/* ---- shared shapes returned by /intel ---- */
export type Launch = {
  address: string
  name: string
  symbol: string
  creator: string
  launchpad: string
  devBuyEth: number
  launchedAt: string
  ageSeconds: number
  spoofFlags: string[]
  dupeCount: number
  riskScore: number
  txHash: string
  theme: { id: string; label: string; slug: string; status: ThemeStatus } | null
  /* What the token says about ITSELF — the deployer's own strings, read from
     getters on the contract, not anything we verified. Named `logo` rather
     than `image` so nobody reads it as ours. About 40% of tradable tokens have
     one; the rest must degrade to a monogram, never a broken image box. */
  logo: string | null
  description: string | null
  socials: string | null
  /* The server's mirrored market figures — what the feed's ordering is computed
     from, so every row carries them, not just the ones on screen. Null means
     never measured, which is NOT zero liquidity. Distinct from the live
     DexScreener read in `lib/markets`, which is fresher but only covers rows
     the browser asked about. */
  market: {
    priceUsd: number | null
    liquidityUsd: number | null
    marketCapUsd: number | null
    volume24hUsd: number | null
    change5m: number | null
    change1h: number | null
    change24h: number | null
    txns5m: number | null
    txns24h: number | null
    at: string
  } | null
  /* Volume WE read off the chain, in ETH, from v4 Swap events.
     Different provenance from `market` and different blind spots: it covers
     pools no aggregator has a pair for and sees a pool's first trades before
     one indexes it, but it is v4-only and denominated in ETH because that is
     what the event says. Null means we have seen no fills — not zero volume. */
  chainVolEth24h: number | null
  /* Where it trades. Null means we have never seen a pool open for it, which
     is a different statement from "it has a pool and we could not price it" —
     the first is a fact about the token, the second a gap in the market read,
     and a row that renders them alike tells the reader something false.
     `pooledAt` is when it became tradable, which is what the feed sorts on. */
  pool: {
    venue: "v3" | "v4"
    address: string | null // v3 only
    id: string | null // v4 only
    pairToken: string | null
    pooledAt: string | null
    routable: boolean
  } | null
  /* Null means NOT MEASURED, not "no holders". The two must never render the
     same way: one is a gap in our coverage, the other is a claim about the
     token. Filled in when someone opens the token page, and topped up in the
     background for recent launches. */
  distribution: {
    holders: number
    top10Pct: number | null
    devHoldsPct: number | null
    devSold: boolean
    measuredAt: string
  } | null
  /* What MADE it — the hash of the deployed runtime bytecode, which is the one
     thing about a launch the deployer did not type. `siblings` counts tokens
     carrying the same code and `deployers` counts the distinct wallets behind
     them: thirty from one wallet is somebody with a script, thirty from
     twenty-eight wallets is a factory serving strangers. Both null means nobody
     counted, which is not the same as "this code is unique". */
  /* What this launch appears to be imitating, and what that target is worth
     RIGHT NOW — liquidity is read live rather than stored, so the warning
     separates a copy of something dead from a copy of something with money in
     it. Null when the index found no earlier launch of the same identity that
     ever traded, which is the ordinary case for a duplicate. */
  impersonates: {
    address: string
    symbol: string
    name: string
    launchedAt: string
    liquidityUsd: number | null
    live: boolean
  } | null
  code: {
    hash: string
    size: number | null
    implementation: string | null
    siblings: number | null
    deployers: number | null
  } | null
}

export type ThemeStatus = "EMERGING" | "HOT" | "SATURATED" | "DECAYING"

/* GET /intel/token/:address/distribution — who holds it.
 *
 * Its own call, not part of the token payload, because the backend replays
 * every Transfer the token has emitted and that takes a second or two. The page
 * renders on what it already has and this fills in.
 *
 * `top10Pct` is null when nobody holds the token — a percentage of nothing is
 * not zero, it is unanswerable, and the panel has to be able to say so. */
export type Distribution = {
  address: string
  holders: number
  top10Pct: number | null
  devHoldsPct: number | null
  devSold: boolean
  devSoldAmount: string
  firstBuyers: number
  firstBuyersStillHolding: number
  decimals: number
  totalSupply: string
  transfersScanned: number
  fromBlock: number
  toBlock: number
  /** True when the replay started at the launch block, which the API enforces. */
  complete: boolean
}

/* GET /intel/separation — the one claim the product rests on, measured rather
   than quoted. Every field is nullable on purpose: a sample too thin to mean
   anything reports itself, and the page has to be able to say nothing. */
export type Separation = {
  checkpoint: number
  sampleSize: number
  lowRisk: { n: number; survivalPct: number | null } | null
  highRisk: { n: number; survivalPct: number | null } | null
  lift: number | null
  conclusive: boolean
  verdict: string
  caveat: string | null
}

export type Theme = {
  id: string
  label: string
  slug: string
  status: ThemeStatus
  launchCount: number
  creatorCount: number
  organicRatio: number
  isOrganic: boolean
  peakVelocity: number
  firstSeenAt: string
  lastSeenAt: string
  ageMinutes: number
  samples: { symbol: string; name: string; address: string; riskScore: number }[]
}

export type Stats = {
  launchesLastHour: number
  launchesLast24h: number
  activeThemes: number
  duplicatesLast24h: number
  duplicatePct: number
  highRiskLast24h: number
  highRiskPct: number
  distinctCreators24h: number
  indexedThroughBlock: string | null
  lastIngestAt: string | null
}

/* A deployer's record. `GET /intel/creators/:wallet` has always returned this
   and nothing rendered it — the one screen where a reader asks "who is this?"
   handed them to a block explorer, which cannot answer it. */
export type CreatorProfile = {
  totalLaunches: number
  distinctThemes: number
  /** Most launches this wallet has fired inside one minute. */
  fastestBurst: number
  /** Percentage of their launches that collided with something else. */
  duplicateRate: number
  spamScore: number
  totalDevBuyEth: number
  firstLaunchAt: string
  lastLaunchAt: string
}

export type CreatorDossier = {
  wallet: string
  profile: CreatorProfile | null
  launches: Launch[]
}

/* Everything the index knows about one launch. `GET /intel/token/:address`.
   Siblings are the other launches in the same cluster — "is this one of forty
   copies?" is the question the risk score answers, and a single row cannot
   show it. */
export type TokenDetail = {
  launch: Launch
  theme: Theme | null
  creator: {
    wallet: string
    totalLaunches: number
    distinctThemes: number
    duplicateRate: number
    spamScore: number
    totalDevBuyEth: number
  } | null
  siblings: Launch[]
}

export function ago(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

export function shortAddr(a?: string | null): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ""
}
