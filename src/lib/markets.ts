import { useEffect, useState } from "react"

/* Whether anyone is actually trading it.
 *
 * The index answers "what launched and does it look manufactured". It cannot
 * answer "is there a market", and that gap was the whole complaint about the
 * feed: rows of names, tickers and a spam score, with nothing to say whether a
 * token had any traction at all. Our own backend cannot close it either —
 * liquidity on this chain lives in Uniswap V4 behind a singleton PoolManager
 * with no per-pair contract to read, which is exactly why `outcomeSampler`
 * measures transfers instead of price.
 *
 * DexScreener indexes Robinhood Chain and answers it in one call. Verified
 * against the live feed: 25 addresses returned 15 pairs in 391ms, across both
 * DEXes on the chain (uniswap v3/v4 and flapsh), quoted in ETH/WETH.
 *
 * IT RUNS IN THE BROWSER ON PURPOSE. The endpoint sends CORS headers, and its
 * rate limit is per-caller — so client-side it scales with users instead of
 * funnelling every visitor through one server-side quota. Moving it behind our
 * own API later is a change of `fetchMarkets`, nothing else.
 *
 * NO MARKET IS A RESULT, NOT A FAILURE. Most launches genuinely have no pool,
 * which is the product's entire premise: you are seeing them before they have a
 * price. A token with no pair returns undefined here and the UI says so. */

export type Market = {
  address: string
  /* The venue's own name for the token. Carried because the token page must
     still be able to say what it is looking at when our index cannot answer —
     an unknown address is a much worse heading than a ticker. */
  symbol: string
  name: string
  priceUsd: number | null
  /* Price in THIS POOL'S quote currency, which is very often not ETH.
     Read it with `quoteToken`, never on its own. */
  priceNative: number | null
  /* Price in ETH, from the deepest ETH-quoted pool this token has — a
   * different pool from the one every other figure here describes, and null
   * when the token has no ETH pair at all.
   *
   * `priceNative` was being read as an ETH price because the comment here said
   * it was one. On this chain it very often is not: tokens are paired against
   * other tokens — MSFT, VIRTUAL, USAR, each of them quoting near 1.0 — and
   * the deepest pool, which is the one every other field describes, is
   * regularly one of those. Measured on `tornadoes`: the deepest pool is
   * MSFT-quoted at priceNative 1.0000000000002560, so a wallet holding 66.7k
   * of it had its portfolio headline read Ξ66,744 — against Ξ0.02 from its
   * actual ETH pair. A fabricated six-figure balance on the one page whose
   * whole job is telling somebody what they are worth. */
  priceEth: number | null
  liquidityUsd: number | null
  volume24h: number | null
  priceChange24h: number | null
  txns24h: number | null
  /* Short windows, which DexScreener already returns in the same response.
   *
   * 24h alone cannot tell a token trading right now from one that traded
   * heavily yesterday and is dead — and the feed was ranking by it, so a
   * finished token outranked a live one. These come free in a call we already
   * make; there is no backend work behind them. m5 is the shortest DexScreener
   * offers, so GMGN's "60 trades in the first minute" rule is not reproducible
   * from this source. */
  txns5m: number | null
  txns1h: number | null
  buys5m: number | null
  sells5m: number | null
  volume5m: number | null
  volume1h: number | null
  priceChange5m: number | null
  priceChange1h: number | null
  marketCap: number | null
  /** The market page, taken from the response. Never constructed by us. */
  url: string
  /** Which DEX the liquidity is actually on. */
  dex: string
  /** Protocol version tags, e.g. ["v3"] or ["v4"]. Decides whether we can
      route a trade in-app or must hand off to the venue. */
  labels: string[]
  /** What the token is paired against. Only a WETH pair can be bought with ETH
      in one hop, so this gates in-app routing alongside the protocol label. */
  quoteToken: string
  /** The venue's own identifier for this market: a pool contract on v3, and the
      poolId itself on v4 — which is the only way to recover a v4 pool key. */
  pairAddress: string
}

const API = "https://api.dexscreener.com/latest/dex/tokens/"
/* THE ADDRESS LIMIT IS NOT THE LIMIT THAT BITES.
 *
 * The endpoint accepts thirty addresses and answers with at most thirty PAIRS
 * — across the whole request, not per token. Tokens here hold several pools
 * each, so a full batch spends its budget on the first few and silently drops
 * the rest. Measured 2026-08-13 against the liquidity ranking:
 *
 *     asked  1  →  8 pairs, covered 1/1
 *     asked  8  → 18 pairs, covered 8/8
 *     asked 10  → 19 pairs, covered 9/10
 *     asked 20  → 30 pairs, covered 18/20
 *     asked 25  → 30 pairs, covered 8/25     ← the setting this replaces
 *
 * Eight of twenty-five. Every token missing from that answer rendered as
 * "no market" while its pools sat there unasked-for, and `tornadoes` — the
 * token that started this whole thread — returned zero pairs in a batch that
 * had room for thirty. Eight per request measured full coverage with headroom,
 * and `fetchPairs` splits anything that still comes back at the cap. */
const CHUNK = 8
/** Pairs per response. Not documented; measured, three times, exactly 30. */
const PAIR_CAP = 30
const TTL_MS = 45_000

type Entry = { at: number; result: MarketResult }
let cache: Entry | null = null
let cacheKey = ""

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN
  return Number.isFinite(n) ? n : null
}

/* An empty map from a failed request and an empty map from a healthy one mean
   opposite things, so the caller is told which it got. Without this the UI
   asserted "No market yet. Nobody can trade this." on every row of a total
   outage — measured against a window where 11 of 30 had live markets, one at
   $51k liquidity. A claim about the chain generated by a network error is the
   one failure mode this product cannot afford. */
export type MarketResult = {
  markets: Map<string, Market>
  ok: boolean
  /* Tokens whose only markets are quoted in another token, and the deepest of
     those. Not a Market — nothing in it can be denominated in ETH or routed
     from here — but the page must be able to say what it found rather than
     "no market", which would be false. */
  otherQuotes: Map<string, { symbol: string; liquidityUsd: number | null; url: string }>
}

/* What counts as ETH on this chain: the wrapper, and the zero address a v4 pool
   uses for native ETH. Anything else quoting a pair is another token, however
   much it looks like money. */
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73"
const NATIVE = "0x0000000000000000000000000000000000000000"
const isEth = (a: string) => a === WETH || a === NATIVE

/* The venue's shape, as much of it as we read. Loose on purpose: this is
   somebody else's payload and every field is checked before it is used. */
type RawPair = {
  baseToken?: { address?: string; symbol?: string; name?: string }
  quoteToken?: { address?: string; symbol?: string }
  /* Everything else is read through `num()` or `String()`, which is why this
     stays loose rather than modelling a payload we do not own. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any
}

/* One request, split if the answer came back truncated.
 *
 * A response that holds exactly the cap AND leaves some of the addresses
 * unrepresented is an answer we cannot read as "those have no pools" — it is an
 * answer that ran out of room. Halving and re-asking is the only way to tell
 * the two apart, and it costs nothing in the normal case because a chunk of
 * eight does not reach the cap. Bounded so a pathological token with thirty
 * pools of its own cannot recurse forever; at depth 3 a single address is being
 * asked alone and the cap is the token's own truth. */
async function fetchPairs(
  addrs: string[],
  depth = 0
): Promise<{ pairs: RawPair[]; ok: boolean }> {
  let json: { pairs?: RawPair[] } | null = null
  try {
    const r = await fetch(API + addrs.join(","))
    if (!r.ok) throw new Error(String(r.status))
    json = await r.json()
  } catch {
    return { pairs: [], ok: false }
  }
  const pairs = json?.pairs || []

  if (pairs.length >= PAIR_CAP && addrs.length > 1 && depth < 3) {
    const covered = new Set(pairs.map((p) => String(p?.baseToken?.address || "").toLowerCase()))
    if (addrs.some((a) => !covered.has(a))) {
      const mid = Math.ceil(addrs.length / 2)
      const [x, y] = await Promise.all([
        fetchPairs(addrs.slice(0, mid), depth + 1),
        fetchPairs(addrs.slice(mid), depth + 1),
      ])
      return { pairs: [...x.pairs, ...y.pairs], ok: x.ok && y.ok }
    }
  }
  return { pairs, ok: true }
}

export async function fetchMarkets(addresses: string[]): Promise<MarketResult> {
  const out = new Map<string, Market>()
  const otherQuotes: MarketResult["otherQuotes"] = new Map()
  /* The deepest pool quoted in something that is not ETH, kept only until we
     know whether the token has an ETH pool at all. */
  const other = new Map<string, { liq: number; symbol: string; liquidityUsd: number | null; url: string }>()
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))]
  if (!unique.length) return { markets: out, ok: true, otherQuotes }

  const chunks: string[][] = []
  for (let i = 0; i < unique.length; i += CHUNK) chunks.push(unique.slice(i, i + CHUNK))

  /* Six at a time. A feed page is 150 rows, which at eight per request is
     nineteen calls — fired all at once that is a burst against a public
     endpoint with a per-caller limit, and the limit answers with the same empty
     body as a token that has no pools. */
  const responses: { pairs: RawPair[]; ok: boolean }[] = []
  for (let i = 0; i < chunks.length; i += 6) {
    responses.push(...(await Promise.all(chunks.slice(i, i + 6).map((c) => fetchPairs(c)))))
  }

  /* EVERY chunk, not some.
     With `some`, one succeeding chunk marked the whole lookup healthy — and the
     addresses in the failed chunk then rendered "no market yet", a claim about
     the chain produced by our own failed request. The comment on that very line
     says a failed lookup must never render as that claim. */
  const ok = responses.length > 0 && responses.every((r) => r.ok)

  for (const r of responses) {
    for (const pair of r.pairs) {
      const addr = String(pair?.baseToken?.address || "").toLowerCase()
      if (!addr) continue
      const liquidityUsd = num(pair?.liquidity?.usd)

      const quote = String(pair?.quoteToken?.address || "").toLowerCase()
      const native = num(pair?.priceNative)

      /* ONLY ETH-QUOTED POOLS BECOME A MARKET.
       *
       * A pool quoted in another token is a real market and not one of ours:
       * it cannot be routed from here (the swap pays in ETH and `poolFromLabels`
       * refuses anything else), it cannot denominate a cost basis, and its
       * depth is not depth anybody can sell into with ETH. Taking the deepest
       * pool of any kind put an $8.2B MSFT pool on `tornadoes` — whose ETH pool
       * holds $0.81 — and, worse, handed the trade panel a pool it then had to
       * refuse while a routable ETH pool sat one entry away in the same
       * response. Depth still decides, among ETH pools. */
      if (!isEth(quote)) {
        const liq = liquidityUsd ?? 0
        const prevOther = other.get(addr)
        if (!prevOther || liq > prevOther.liq) {
          other.set(addr, {
            liq,
            symbol: String(pair?.quoteToken?.symbol || "another token"),
            liquidityUsd,
            url: String(pair?.url || ""),
          })
        }
        continue
      }

      const prev = out.get(addr)
      // A token can have several ETH pools — fee tiers, both Uniswap versions.
      // The deepest is the market that matters and the one a handoff points at.
      if (prev && (prev.liquidityUsd ?? 0) >= (liquidityUsd ?? 0)) continue
      const buys = num(pair?.txns?.h24?.buys) ?? 0
      const sells = num(pair?.txns?.h24?.sells) ?? 0
      const b5 = num(pair?.txns?.m5?.buys)
      const s5 = num(pair?.txns?.m5?.sells)
      const b1h = num(pair?.txns?.h1?.buys)
      const s1h = num(pair?.txns?.h1?.sells)
      const sum = (a: number | null, b: number | null) =>
        a === null && b === null ? null : (a ?? 0) + (b ?? 0)
      out.set(addr, {
        address: addr,
        symbol: String(pair?.baseToken?.symbol || ""),
        name: String(pair?.baseToken?.name || ""),
        priceUsd: num(pair?.priceUsd),
        priceNative: native,
        /* The same number, named for what it actually is. Every pool that
           reaches here is ETH-quoted, so this is an ETH price — which
           `priceNative` was being read as, and is not. */
        priceEth: native,
        liquidityUsd,
        volume24h: num(pair?.volume?.h24),
        priceChange24h: num(pair?.priceChange?.h24),
        txns24h: buys + sells,
        txns5m: sum(b5, s5),
        txns1h: sum(b1h, s1h),
        buys5m: b5,
        sells5m: s5,
        volume5m: num(pair?.volume?.m5),
        volume1h: num(pair?.volume?.h1),
        priceChange5m: num(pair?.priceChange?.m5),
        priceChange1h: num(pair?.priceChange?.h1),
        marketCap: num(pair?.marketCap) ?? num(pair?.fdv),
        url: String(pair?.url || ""),
        dex: String(pair?.dexId || ""),
        labels: Array.isArray(pair?.labels) ? pair.labels.map(String) : [],
        quoteToken: quote,
        pairAddress: String(pair?.pairAddress || ""),
      })
    }
  }

  /* Only now, because a token's ETH pool can appear in any chunk and in any
     order relative to its token-token ones. Reported only where there is no
     ETH market at all — otherwise it is a curiosity about a pool nobody here
     will use. */
  for (const [addr, o] of other) {
    if (out.has(addr)) continue
    otherQuotes.set(addr, { symbol: o.symbol, liquidityUsd: o.liquidityUsd, url: o.url })
  }

  return { markets: out, ok, otherQuotes }
}

/** Markets for a set of addresses, refreshed with the page. `null` while in
    flight — callers must not read "no market" out of a pending request. */
export function useMarkets(addresses: string[] | null): MarketResult | null {
  const [result, setResult] = useState<MarketResult | null>(null)
  const key = (addresses || []).join(",")

  useEffect(() => {
    // An empty list is a settled answer, not a pending one. Returning without
    // resolving left every consumer holding `null` forever, which rendered
    // skeletons that never stopped pulsing on an empty feed.
    if (!addresses || !addresses.length) {
      setResult({ markets: new Map(), ok: true, otherQuotes: new Map() })
      return
    }
    let alive = true

    if (cache && cacheKey === key && Date.now() - cache.at < TTL_MS) {
      setResult(cache.result)
      return
    }

    /* In flight is null, which is what this hook's own contract says and what
       it was not doing: on a key change it went on returning the PREVIOUS
       list's result until the new one landed. Consumers read that as a settled
       answer about addresses it had never been asked about — the portfolio
       folded every position into "no market" for a beat, because a settled
       result missing your token means exactly that. */
    setResult(null)

    fetchMarkets(addresses)
      .then((r) => {
        if (!alive) return
        // Only a good read is worth caching.
        if (r.ok) {
          cache = { at: Date.now(), result: r }
          cacheKey = key
        }
        setResult(r)
      })
      // A missing market layer must never blank a working feed.
      .catch((e) => {
        console.error("[markets] unavailable:", e)
        if (alive) setResult({ markets: new Map(), ok: false, otherQuotes: new Map() })
      })

    return () => {
      alive = false
    }
  }, [key])

  return result
}

/* Compact money. $36,144 is four glyphs of noise in a row that has to scan. */
export function usd(n: number | null): string {
  if (n === null) return "—"
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return `$${n.toFixed(0)}`
}
