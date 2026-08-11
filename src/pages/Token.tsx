import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { getJSON, ago, shortAddr } from "@/lib/api"
import type { TokenDetail } from "@/lib/api"
import { EXPLORER, FLAG_TEXT, EmptyState, Skeleton, RiskPill } from "@/components/intel"
import { Page, SectionHead } from "@/components/shell"
import { useMarkets, usd, type Market } from "@/lib/markets"
import { Chart, Trades } from "@/components/market"
import SwapPanel from "@/components/SwapPanel"
import DistributionPanel from "@/components/Distribution"
import { getDecimals, poolFromLabels, resolveRoute, type Pool } from "@/lib/swap"
import { getPoolAddress, v4Source, type TradeSource } from "@/lib/trades"

/* One token: everything about it, the tape, and the trade.
 *
 * The missing route. There was no way to look a token up at all — no
 * `/token/:address`, no search, and the address was not even rendered as
 * selectable text, so it could not be found with Ctrl+F. "Someone sent me this
 * ticker" is the most common way anyone arrives at a product like this, and it
 * terminated in a 404.
 *
 * WHAT THIS IS AND IS NOT. The interface is ours; the execution is not. A trade
 * here is built as calldata and signed in the user's wallet against Uniswap's
 * router — NewEra deploys no contract, holds no keys, and never takes custody,
 * so we are not a venue and there is nothing of ours to audit. What we are is
 * the surface that constructs the transaction, which is a real responsibility
 * and is why both swap paths are verified against the chain in
 * `tools/audit/swap.mjs` rather than trusted.
 *
 * Uniswap v3 and v4 both route in-app, in both directions. flapsh, and any v4
 * pool whose key cannot be recovered from the chain, fall through to the venue's
 * own interface — a wrong route is worse than an honest handoff.
 *
 * Three sources, degrading independently: our index (`/intel/token/:address`,
 * which 404s for anything older than the watcher), DexScreener (price, depth,
 * candles), and the chain itself (quotes, fills, execution). Any one can be
 * down without blanking the others. */

/* A token page is only ever about a real address.
 *
 * Anything at all in the URL used to become a confident token identity: `0xnope`
 * and an emoji string both rendered a titled page asserting "No market yet.
 * Nobody can trade this. That is the normal state of a new launch" — a claim
 * that the thing IS a launch, about a string that is not even an address. The
 * zero address was worse: DexScreener answers for it, so `/app/token/0x0…0`
 * rendered as ETH with a $35M market and a Trade button. The creator page
 * already refuses this ("That does not look like a wallet address"); the token
 * page did not. */
const IS_ADDRESS = /^0x[a-fA-F0-9]{40}$/
/* Not a token. DexScreener returns real ETH market data for it and every zero
   address in a malformed link lands here. */
const ZERO = "0x0000000000000000000000000000000000000000"

export default function Token() {
  const { address = "" } = useParams()
  const usable = IS_ADDRESS.test(address) && address.toLowerCase() !== ZERO
  const [data, setData] = useState<TokenDetail | null>(null)
  const [indexState, setIndexState] = useState<"loading" | "ok" | "missing" | "down">("loading")

  useEffect(() => {
    setData(null)
    if (!usable) {
      setIndexState("missing")
      return
    }
    setIndexState("loading")
    getJSON<TokenDetail>(`/intel/token/${encodeURIComponent(address)}`)
      .then((d) => {
        setData(d)
        setIndexState("ok")
      })
      .catch((e: Error) => setIndexState(e.message.includes("404") ? "missing" : "down"))
  }, [address, usable])

  const markets = useMarkets(useMemo(() => (usable ? [address] : []), [address, usable]))
  const market = markets?.markets.get(address.toLowerCase())
  const marketState = markets === null ? "loading" : markets.ok ? "ok" : "down"

  /* Which protocol holds the market decides whether we can route the trade at
     all. DexScreener's labels answer it without another chain call; the fee
     tier and pool address then come from the chain, because only the chain
     knows them. */
  const [pool, setPool] = useState<Pool | null>(null)
  const [tapeSource, setTapeSource] = useState<TradeSource | null>(null)
  const [decimals, setDecimals] = useState(18)

  useEffect(() => {
    setPool(null)
    setTapeSource(null)
    if (!market || !address) return
    let alive = true

    const candidate = poolFromLabels(market.dex || undefined, market.labels, market.quoteToken)
    if (!candidate.supported) {
      setPool(candidate)
      return
    }
    ;(async () => {
      /* DexScreener's `pairAddress` is a contract address for v3 and the poolId
         itself for v4 — resolveRoute needs the latter to recover the pool key. */
      const [resolved, dec] = await Promise.all([
        resolveRoute(address, candidate, market.pairAddress),
        getDecimals(address),
      ])
      if (!alive) return
      setDecimals(dec)
      setPool(resolved)

      /* The tape reads whichever record this protocol keeps: a v3 pool contract,
         or the v4 PoolManager filtered by pool id. Both are the chain's own
         account of who traded, not ours. */
      if (resolved.protocol === "v4" && resolved.key) {
        if (alive) setTapeSource(v4Source(resolved.key))
      } else if (resolved.protocol === "v3" && resolved.fee !== undefined) {
        const p = await getPoolAddress(address, resolved.fee)
        if (alive && p) setTapeSource({ kind: "v3", pool: p })
      }
    })()

    return () => {
      alive = false
    }
  }, [market, address])

  const launch = data?.launch
  /* Our index first, the venue second, the address last. The index is the
     better source — it has the name at mint, before anyone could rename
     anything — but when it cannot answer, the venue still knows what this is,
     and a bare address is a far worse heading than a ticker. */
  const symbol = launch?.symbol || market?.symbol || ""
  const name = launch?.name || market?.name || ""

  useEffect(() => {
    document.title = !usable
      ? "Not a token address · NewEra"
      : symbol
        ? `${symbol} · Token · NewEra`
        : `${shortAddr(address)} · Token · NewEra`
  }, [symbol, address, usable])

  if (!usable) {
    return (
      <Page>
        <Link
          to="/app"
          className="mb-4 inline-flex items-center gap-2 py-1.5 text-sm text-fg-dim transition-colors hover:text-acid-500"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to live feed
        </Link>
        <h1 className="mt-4 text-[clamp(1.4rem,3vw,2.2rem)] font-semibold text-fg">
          That is not a token address
        </h1>
        <p className="measure mt-4 text-base leading-relaxed text-fg-muted">
          A token address is 42 characters beginning <code className="font-mono text-fg">0x</code>.
          Check the link you followed, or find the token by ticker on the live feed.
        </p>
      </Page>
    )
  }

  return (
    <Page>
      <Link
        to="/app"
        className="mb-4 inline-flex items-center gap-2 py-1.5 text-sm text-fg-dim transition-colors hover:text-acid-500"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back to live feed
      </Link>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-mono text-[clamp(1.4rem,3vw,2.2rem)] font-semibold tracking-[-0.01em] text-fg">
          {symbol || shortAddr(address)}
        </h1>
        {name && name !== symbol && <span className="text-base text-fg-muted">{name}</span>}
        {launch && <RiskPill score={launch.riskScore} />}
      </div>

      {/* The address as selectable text, which it never was — it existed only
          inside an href, so it could not even be copied or searched for. */}
      <p className="mt-2 break-all font-mono text-xs text-fg-dim">{address}</p>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        <a
          href={`${EXPLORER}/token/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="scan-link -my-1.5 py-1.5 text-xs text-acid-500"
        >
          Contract on Blockscout ↗
        </a>
        {launch?.txHash && (
          <a
            href={`${EXPLORER}/tx/${launch.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="scan-link -my-1.5 py-1.5 text-xs text-acid-500"
          >
            Creation transaction ↗
          </a>
        )}
      </div>

      <TheMarket market={market} state={marketState} />

      {/* Two rails, because deciding and acting are one task.
          Stacked, the trade panel sat a full screen above the chart it is a
          judgement about — you set an amount, then scrolled away from the form
          to see the price, then scrolled back. Side by side, the chart and the
          tape answer "is this worth it" while the panel that acts on the answer
          stays in view. Below `xl` there is not enough width for a chart and a
          form to coexist, so it returns to one column with the panel first —
          on a narrow screen the action outranks its context. */}
      <div className="mt-[6vh] grid items-start gap-x-10 gap-y-[6vh] xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="order-2 min-w-0 xl:order-1">
          {market?.url && market.liquidityUsd ? (
            <Chart venueUrl={market.url} symbol={symbol} />
          ) : null}
          <Trades source={tapeSource} symbol={symbol} decimals={decimals} />
        </div>

        {market?.liquidityUsd && pool && (
          /* Sticky by its top edge only because this panel is shorter than a
             viewport. DESIGN.md's rule holds: a sticky element taller than the
             screen pins anyway and buries everything past its fold, so the rail
             caps its height and scrolls internally rather than trusting that it
             always fits. */
          <div className="order-1 xl:sticky xl:top-24 xl:order-2 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto">
            <SwapPanel
              token={address}
              symbol={symbol}
              pool={pool}
              venueUrl={market.url}
              venueName={market.dex}
            />
          </div>
        )}
      </div>

      {/* Above "what the index knows", because it answers the earlier question.
          The index panel says whether the NAME is a copy; this says whether the
          position can be exited, and a reader wants that first. */}
      {usable && <DistributionPanel address={address.toLowerCase()} />}

      <WhatWeKnow data={data} state={indexState} />
      <Siblings data={data} />
    </Page>
  )
}

/* Price, depth and the handoff. Everything here is DexScreener's, and the
   section says so — a figure whose provenance is unclear is worse than no
   figure on a product built on "measured, not projected". */
function TheMarket({
  market,
  state,
}: {
  market?: Market
  state: "loading" | "ok" | "down"
}) {
  if (state === "loading") {
    return (
      <section className="mt-[6vh] border-y border-edge py-7">
        <Skeleton h={90} />
      </section>
    )
  }

  if (state === "down") {
    return (
      <section className="mt-[6vh] border-y border-edge py-7">
        <p className="text-base text-warn">
          Market data is unavailable right now. This is a lookup failure on our side, not a
          statement about this token.
        </p>
      </section>
    )
  }

  if (!market || !market.liquidityUsd) {
    return (
      <section className="mt-[6vh] border-y border-edge py-7">
        <p className="max-w-[46ch] text-[clamp(1.05rem,1.7vw,1.35rem)] leading-[1.5] text-fg">
          No market yet. Nobody can trade this.
        </p>
        <p className="measure mt-3 text-sm leading-relaxed text-fg-dim">
          That is the normal state of a new launch, and the reason this page exists — you are
          seeing it before it has a price.
        </p>
      </section>
    )
  }

  const chg = market.priceChange24h
  // Monochrome — see the note in LaunchTable. Acid and danger are verdicts.
  const tone = "text-fg"
  const cells: { v: string; l: string }[] = [
    { v: market.priceUsd !== null ? `$${market.priceUsd.toPrecision(4)}` : "—", l: "price" },
    { v: usd(market.liquidityUsd), l: "liquidity" },
    { v: usd(market.volume24h), l: "traded 24h" },
    { v: market.txns24h !== null ? market.txns24h.toLocaleString("en-US") : "—", l: "trades 24h" },
    { v: usd(market.marketCap), l: "market cap" },
  ]

  const figures = chg === null ? cells : [...cells, {
    v: `${chg >= 0 ? "+" : ""}${chg.toFixed(chg >= 100 || chg <= -100 ? 0 : 1)}%`,
    l: "24h",
    tone,
  }]

  /* Is it trading NOW, or did it finish?
   *
   * "Traded 24h" cannot tell those apart, and they are opposite answers to the
   * only question this block is asked. DexScreener returns m5 and h1 in the
   * same response, so the comparison costs nothing. Stated as an observation:
   * a token whose whole day happened in the last hour is a token that just
   * started, and one with nothing in an hour has stopped — neither is a
   * forecast about what happens next. */
  const t5 = market.txns5m
  const t1h = market.txns1h

  /* Trade count alone is the wrong tell, and it is the one GMGN publishes.
   *
   * Their rule is "over 60 trades in the first minute indicates genuine
   * activity rather than wash trading". Measured against this chain the same
   * afternoon: one token showed 1,112 trades in five minutes on $3,631 of
   * volume — $3.27 a trade — while another showed 151 trades on $48,086, or
   * $318 a trade. The rule rates the first as the most genuine token on the
   * list. Average size separates them by two orders of magnitude, so we state
   * both and let the reader see the shape rather than asserting "wash
   * trading", which we cannot prove from a trade count. */
  const avg5m = t5 && t5 > 0 && market.volume5m !== null ? market.volume5m / t5 : null

  const pace =
    t5 === null || t1h === null
      ? null
      : t5 > 0
        ? { text: `${t5.toLocaleString("en-US")} ${t5 === 1 ? "trade" : "trades"} in the last five minutes`, live: true }
        : t1h > 0
          ? { text: `Nothing in five minutes; ${t1h.toLocaleString("en-US")} in the last hour`, live: false }
          : { text: "No trades in the last hour", live: false }

  return (
    <section className="mt-[6vh] border-y border-edge py-7">
      {/* An even grid across the full width, not a left-packed flex row. Packed,
          the figures clustered against the left edge and left a 500px hole
          before the venue link at 1920 — six measurements reading as a huddle
          rather than as the instrument panel they are. Equal columns give each
          figure the same weight, which is also true: no one of them leads. */}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
        <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
          {figures.map((c) => (
            <div key={c.l}>
              <div className={`font-mono text-xl font-medium tabular-nums ${("tone" in c && c.tone) || "text-fg"}`}>
                {c.v}
              </div>
              <div className="mt-1 font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
                {c.l}
              </div>
            </div>
          ))}
        </div>

        {market.url && (
          <a
            href={market.url}
            target="_blank"
            rel="noopener noreferrer"
            className="scan-link -my-1.5 flex-none py-1.5 text-sm text-acid-500"
          >
            See it on {market.dex || "the venue"} ↗
          </a>
        )}
      </div>

      {pace && (
        <p className="mt-5 flex flex-wrap items-baseline gap-x-3 text-sm">
          <span className={pace.live ? "text-acid-500" : "text-warn"}>{pace.text}</span>
          {market.buys5m !== null && market.sells5m !== null && (t5 ?? 0) > 0 && (
            <span className="font-mono text-xs text-fg-dim">
              {market.buys5m} buying · {market.sells5m} selling
            </span>
          )}
          {avg5m !== null && (
            <span className="font-mono text-xs text-fg-dim">
              averaging{" "}
              {avg5m < 1
                ? `$${avg5m.toFixed(2)}`
                : `$${Math.round(avg5m).toLocaleString("en-US")}`}{" "}
              a trade
            </span>
          )}
        </p>
      )}

      {/* This paragraph used to say NewEra "does not execute trades", which
          stopped being true the moment the swap panel shipped. What survives is
          the part that still holds and matters more: no custody, no keys. */}
      {/* One line. The full custody position is stated inside the trade panel,
          beside the control it actually governs, so saying it twice at length
          only pushed the chart and the panel further down the page. */}
      <p className="mt-4 text-xs leading-relaxed text-fg-dim">
        Depth, price and candles from DexScreener.{" "}
        <b className="font-semibold text-fg-muted">NewEra never holds your funds or your keys.</b>
      </p>
    </section>
  )
}

/* The half only NewEra has: what was knowable at block zero. */
function WhatWeKnow({
  data,
  state,
}: {
  data: TokenDetail | null
  state: "loading" | "ok" | "missing" | "down"
}) {
  if (state === "loading") return <section className="mt-[7vh]"><Skeleton h={120} /></section>

  if (state === "missing" || state === "down") {
    return (
      <section className="mt-[7vh]">
        <SectionHead title="What the index knows" />
        <div className="mt-5">
          <EmptyState>
            {state === "missing"
              ? "This address is not in the index. It may have launched before indexing began, or on a path the watcher does not cover."
              : "The intelligence API is not answering, so the launch record cannot be shown. The market figures above come from a different source and are unaffected."}
          </EmptyState>
        </div>
      </section>
    )
  }

  if (!data) return null
  const { launch, theme, creator } = data
  const flags = launch.spoofFlags || []

  return (
    <section className="mt-[7vh]">
      <SectionHead title="What the index knows" />

      <p className="measure mt-5 text-base leading-relaxed text-fg">
        Launched <b className="font-mono">{ago(launch.ageSeconds)}</b> ago on{" "}
        <b className="font-mono">{launch.launchpad}</b>, scoring{" "}
        <b className="font-mono">{launch.riskScore}/100</b> for how machine-generated it looks.{" "}
        {flags.length === 0 && launch.dupeCount === 0
          ? "No duplicate or impersonation flags."
          : null}
      </p>

      {(flags.length > 0 || launch.dupeCount > 0) && (
        <ul className="mt-4 flex flex-col gap-2">
          {flags.map((f) => (
            <li key={f} className="flex gap-3 text-sm leading-relaxed text-fg-muted">
              <span aria-hidden className="mt-[10px] h-px w-3 flex-none bg-danger" />
              <span>{FLAG_TEXT[f] || f}</span>
            </li>
          ))}
          {launch.dupeCount > 0 && (
            <li className="flex gap-3 text-sm leading-relaxed text-fg-muted">
              <span aria-hidden className="mt-[10px] h-px w-3 flex-none bg-warn" />
              <span>
                {launch.dupeCount} other {launch.dupeCount === 1 ? "launch" : "launches"} around the
                same time carried a near-identical name or ticker.
              </span>
            </li>
          )}
        </ul>
      )}

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        {theme && (
          <Link to={`/app/theme/${theme.slug}`} className="scan-row block border-t border-edge py-4 pl-3">
            <span className="block font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
              Cluster
            </span>
            <span className="mt-1.5 block text-base font-semibold text-fg">{theme.label}</span>
            <span className="mt-1 block text-sm text-fg-muted">
              {theme.creatorCount} {theme.creatorCount === 1 ? "wallet" : "wallets"},{" "}
              {theme.launchCount} launches →
            </span>
          </Link>
        )}
        <Link
          to={`/app/creator/${launch.creator}`}
          className="scan-row block border-t border-edge py-4 pl-3"
        >
          <span className="block font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
            Deployer
          </span>
          <span className="mt-1.5 block font-mono text-base font-semibold text-fg">
            {shortAddr(launch.creator)}
          </span>
          <span className="mt-1 block text-sm text-fg-muted">
            {creator
              ? `${creator.totalLaunches.toLocaleString("en-US")} launches, ${creator.duplicateRate}% duplicates →`
              : /* Only reachable when the index holds no launches at all for
                   this wallet, which cannot happen for a token it indexed —
                   but the old text promised a record either way, and for most
                   of last month it led to a page with none on it. */
                "No other launches from this wallet in the index →"}
          </span>
        </Link>
      </div>
    </section>
  )
}

function Siblings({ data }: { data: TokenDetail | null }) {
  const siblings = data?.siblings || []
  if (!data || siblings.length === 0) return null

  return (
    <section className="mt-[7vh]">
      <SectionHead title="Others in this cluster" note={`${siblings.length} shown`} />
      <div className="mt-2">
        {siblings.map((s) => (
          <Link
            key={s.address}
            to={`/app/token/${s.address}`}
            className="scan-row grid grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-4 border-b border-edge py-3 pl-3"
          >
            <span className="font-mono text-micro text-fg-dim">{ago(s.ageSeconds)}</span>
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
              <span className="font-mono text-sm font-semibold text-fg">{s.symbol || "—"}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-fg-dim">{s.name}</span>
            </span>
            <RiskPill score={s.riskScore} />
          </Link>
        ))}
      </div>
    </section>
  )
}
