import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { getJSON, ago, shortAddr } from "@/lib/api"
import type { TokenDetail } from "@/lib/api"
import { EXPLORER, FLAG_TEXT, EmptyState, Skeleton, RiskPill } from "@/components/intel"
import { useMarkets, usd, type Market } from "@/lib/markets"

/* One token, everything about it, and the way out to trade it.
 *
 * The missing route. There was no way to look a token up at all — no
 * `/token/:address`, no search, and the address was not even rendered as
 * selectable text, so it could not be found with Ctrl+F. "Someone sent me this
 * ticker" is the most common way anyone arrives at a product like this, and it
 * terminated in a 404.
 *
 * WHAT THIS IS NOT. It is not a venue. NewEra executes nothing, holds no keys,
 * and quotes no prices of its own — the chart and the market figures come from
 * DexScreener, and the trade action opens that market on its own venue. Building
 * a swap here would mean routing against Uniswap V4's singleton with approvals
 * and slippage, which is the trading infrastructure this product exists not to
 * build, and it would falsify the claim on the landing page.
 *
 * The index half degrades on its own: `/intel/token/:address` may not be
 * deployed yet, and a token that predates the indexer will 404 forever. Market
 * data still renders in that case, clearly separated from "what we know". */

export default function Token() {
  const { address = "" } = useParams()
  const [data, setData] = useState<TokenDetail | null>(null)
  const [indexState, setIndexState] = useState<"loading" | "ok" | "missing" | "down">("loading")

  useEffect(() => {
    setData(null)
    setIndexState("loading")
    getJSON<TokenDetail>(`/intel/token/${encodeURIComponent(address)}`)
      .then((d) => {
        setData(d)
        setIndexState("ok")
      })
      .catch((e: Error) => setIndexState(e.message.includes("404") ? "missing" : "down"))
  }, [address])

  const markets = useMarkets(useMemo(() => (address ? [address] : []), [address]))
  const market = markets?.markets.get(address.toLowerCase())
  const marketState = markets === null ? "loading" : markets.ok ? "ok" : "down"

  const launch = data?.launch
  /* Our index first, the venue second, the address last. The index is the
     better source — it has the name at mint, before anyone could rename
     anything — but when it cannot answer, the venue still knows what this is,
     and a bare address is a far worse heading than a ticker. */
  const symbol = launch?.symbol || market?.symbol || ""
  const name = launch?.name || market?.name || ""

  useEffect(() => {
    document.title = symbol
      ? `${symbol} · Token · NewEra`
      : `${shortAddr(address)} · Token · NewEra`
  }, [symbol, address])

  return (
    <div className="mx-auto max-w-[72rem] px-[4vw] pb-[14vh] pt-[13vh]">
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
      <WhatWeKnow data={data} state={indexState} />
      <Siblings data={data} />
    </div>
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
  const tone = chg === null ? "text-fg" : chg >= 0 ? "text-acid-500" : "text-danger"
  const cells: { v: string; l: string }[] = [
    { v: market.priceUsd !== null ? `$${market.priceUsd.toPrecision(4)}` : "—", l: "price" },
    { v: usd(market.liquidityUsd), l: "liquidity" },
    { v: usd(market.volume24h), l: "traded 24h" },
    { v: market.txns24h !== null ? market.txns24h.toLocaleString("en-US") : "—", l: "trades 24h" },
    { v: usd(market.marketCap), l: "market cap" },
  ]

  return (
    <section className="mt-[6vh] border-y border-edge py-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-x-10 gap-y-5">
          {cells.map((c) => (
            <div key={c.l}>
              <div className="font-mono text-xl font-medium text-fg">{c.v}</div>
              <div className="mt-1 font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
                {c.l}
              </div>
            </div>
          ))}
          {chg !== null && (
            <div>
              <div className={`font-mono text-xl font-medium ${tone}`}>
                {chg >= 0 ? "+" : ""}
                {chg.toFixed(chg >= 100 || chg <= -100 ? 0 : 1)}%
              </div>
              <div className="mt-1 font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
                24h
              </div>
            </div>
          )}
        </div>

        {market.url && (
          <a
            href={market.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block-btn bg-acid-500 font-semibold text-ink-950"
          >
            Trade on {market.dex || "the venue"} ↗
          </a>
        )}
      </div>

      <p className="measure mt-5 text-xs leading-relaxed text-fg-dim">
        Price, depth and the chart come from DexScreener, which indexes this chain.{" "}
        <b className="font-semibold text-fg-muted">NewEra does not execute trades and holds no
        keys</b> — the button opens the market on its own venue, where you trade from your own
        wallet.
      </p>

      {market.url && (
        <div className="mt-6 overflow-hidden border border-edge">
          {/* DexScreener sends no X-Frame-Options and no CSP on its embed view,
              so the chart can be framed. It is their widget, not our quote. */}
          <iframe
            src={`${market.url}?embed=1&theme=dark&info=0`}
            title="Price chart"
            loading="lazy"
            className="h-[420px] w-full border-0 sm:h-[520px]"
          />
        </div>
      )}
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
        <h2 className="border-b border-edge pb-3 text-xl font-semibold text-fg">
          What the index knows
        </h2>
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
      <h2 className="border-b border-edge pb-3 text-xl font-semibold text-fg">
        What the index knows
      </h2>

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
              : "See their record →"}
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
      <div className="flex items-baseline justify-between gap-4 border-b border-edge pb-3">
        <h2 className="text-xl font-semibold text-fg">Others in this cluster</h2>
        <span className="font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
          {siblings.length} shown
        </span>
      </div>
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
