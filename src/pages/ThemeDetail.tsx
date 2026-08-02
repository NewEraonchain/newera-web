import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { getJSON, ago, shortAddr } from "@/lib/api"
import type { Launch, Theme } from "@/lib/api"
import {
  StatusBadge,
  RiskPill,
  FlagPill,
  MarketLine,
  EXPLORER,
  EmptyState,
  Skeleton,
} from "@/components/intel"
import { useMarkets } from "@/lib/markets"

type Detail = {
  theme: Theme
  launches: Launch[]
  series: { at: string; velocity: number; launchCount: number }[]
}

export default function ThemeDetail() {
  const { slug = "" } = useParams()
  const [data, setData] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    setError(null)
    getJSON<Detail>(`/intel/themes/${encodeURIComponent(slug)}`)
      .then(setData)
      .catch((e: Error) =>
        setError(
          e.message.includes("404")
            ? "That cluster no longer exists, or was never indexed."
            : /* A raw exception string was being rendered as the entire page
                 body — "HTTP 500", or a JSON parser's position complaint. */
              "Could not load this cluster. The intelligence API is not responding — try again in a moment.",
        ),
      )
  }, [slug])

  /* The cluster is the product's shareable unit, so its tab and history entry
     should say which cluster it is. App.tsx deliberately leaves /app/theme/* to
     this effect rather than racing it with a generic title. */
  useEffect(() => {
    if (data?.theme?.label) document.title = `${data.theme.label} · Cluster · NewEra`
  }, [data])

  if (error) {
    return (
      <Shell>
        <EmptyState>{error}</EmptyState>
      </Shell>
    )
  }
  if (!data) {
    return (
      <Shell>
        <Skeleton h={120} />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} h={88} />
          ))}
        </div>
      </Shell>
    )
  }

  const { theme, launches, series } = data
  return (
    <Shell>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {/* Same transition name as the row that opened this page, so the two
            are one object morphing rather than two views cutting. */}
        <h1
          style={{ viewTransitionName: `cluster-${slug}` }}
          className="font-display text-[clamp(2rem,5vw,4rem)] font-extrabold uppercase leading-[0.9] tracking-[-0.03em] [overflow-wrap:anywhere]"
        >
          {theme.label}
        </h1>
        <StatusBadge status={theme.status} />
      </div>

      <Verdict theme={theme} launches={launches} />
      <Metrics theme={theme} launches={launches} />
      <Velocity series={series} />
      <Creators launches={launches} />
      <Launches launches={launches} />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-[4vw] pb-[14vh] pt-[13vh]">
      <Link
        to="/app"
        className="mb-4 inline-flex items-center gap-2 py-1.5 text-sm text-fg-dim transition-colors hover:text-acid-500"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back to live feed
      </Link>
      {children}
    </div>
  )
}

/* One sentence saying what this actually is. The numbers are on screen anyway;
   this is the reading of them. */
function Verdict({ theme, launches }: { theme: Theme; launches: Launch[] }) {
  const flagged = launches.filter((l) => (l.spoofFlags || []).length > 0).length
  const flaggedPct = launches.length ? Math.round((flagged / launches.length) * 100) : 0
  const withBuy = launches.filter((l) => l.devBuyEth > 0).length

  let tone: "good" | "warn" | "bad" = "good"
  let body: React.ReactNode

  if (!theme.isOrganic) {
    tone = "bad"
    const per = (theme.launchCount / Math.max(1, theme.creatorCount)).toFixed(1)
    body = (
      <>
        <b>{theme.creatorCount === 1 ? "A single wallet is manufacturing this." : "Manufactured, not organic."}</b>{" "}
        {theme.creatorCount === 1
          ? `All ${theme.launchCount} launches came from one address.`
          : `${theme.launchCount} launches from only ${theme.creatorCount} wallets — about ${per} each.`}{" "}
        Real narratives spread across many independent creators; this is a handful of actors
        repeating themselves, so volume here reflects their effort rather than genuine interest.
      </>
    )
  } else if (theme.status === "EMERGING" && theme.ageMinutes < 90) {
    body = (
      <>
        <b>Genuinely emerging.</b> {theme.creatorCount} independent wallets launched into this in{" "}
        {ago(theme.ageMinutes * 60)}, and it has not saturated yet.{" "}
        {withBuy
          ? `${withBuy} creator${withBuy === 1 ? "" : "s"} put real money into their own launch.`
          : "No creator has bought their own launch yet, so nobody has staked anything."}{" "}
        {flaggedPct > 50 &&
          `${flaggedPct}% are near-copies of each other, which is normal this early but worth watching.`}
      </>
    )
  } else if (theme.status === "SATURATED") {
    tone = "warn"
    body = (
      <>
        {/* Was "the move here, if there was one, has mostly happened" — a
            market-timing verdict, rendered per cluster in a coloured box above
            live price data. The state describes launch behaviour; that is all
            it can honestly describe. */}
        <b>Already crowded.</b> {theme.launchCount} launches, and launch velocity is falling from a
        peak of {Math.round(theme.peakVelocity)}/hr. New launches into this cluster have mostly
        stopped.
      </>
    )
  } else if (theme.status === "DECAYING") {
    tone = "warn"
    {/* "cluster", not "theme". The nav says Clusters, the feed says clusters,
        and the API says themes — the API may keep its word, but a reader
        following a "cluster" from the feed should not arrive at a page talking
        about themes. */}
    body = <><b>Effectively over.</b> Almost nothing new is launching into this cluster.</>
  } else {
    body = (
      <>
        <b>Active and broadly held.</b> {theme.launchCount} launches from {theme.creatorCount}{" "}
        creators, peaking around {Math.round(theme.peakVelocity)}/hr.
      </>
    )
  }

  const style = {
    good: "border-acid-500/28 bg-acid-500/[.07] text-[#d6e8b4]",
    warn: "border-warn/28 bg-warn/[.07] text-[#e8d3b4]",
    bad: "border-danger/28 bg-danger/[.07] text-[#e8bec4]",
  }[tone]

  /* py-4, not none. This carries a tinted background as well as the left rule,
     so with no vertical inset the text sat flush against both — the standing
     `cramped-padding` finding on this route. I had recorded it as
     data-dependent because it reproduced on the previous commit too; it is not,
     it is structural and reproduces whenever a verdict renders. */
  return (
    <div className={`mb-8 border-l py-4 pl-5 pr-4 text-sm leading-relaxed ${style}`}>
      <span className="[&_b]:text-fg">{body}</span>
    </div>
  )
}

function Metrics({ theme, launches }: { theme: Theme; launches: Launch[] }) {
  const flagged = launches.filter((l) => (l.spoofFlags || []).length > 0).length
  const totalBuy = launches.reduce((a, l) => a + (l.devBuyEth || 0), 0)
  const dupePct = launches.length ? Math.round((flagged / launches.length) * 100) : 0

  /* Every label carries what it means.
   *
   * This is the deepest page in the funnel and it introduced six terms that
   * appear nowhere else in the product — "creator diversity", "peak velocity",
   * "near-duplicates", "total dev buy" — with no tooltip, no legend and no link
   * out. The pattern already existed one file away in `intel.tsx`; it just was
   * not applied here. `hint` is rendered, not hidden in a `title`, because a
   * hover reaches neither touch nor a screen reader. */
  const items: { v: React.ReactNode; l: string; hint: string; tone?: string }[] = [
    { v: theme.launchCount, l: "launches", hint: "tokens created in this cluster" },
    {
      v: theme.creatorCount,
      l: "distinct wallets",
      hint: "how many different addresses launched them",
      tone: theme.isOrganic ? "acid" : "bad",
    },
    {
      v: `${Math.round(theme.organicRatio * 100)}%`,
      l: "wallets per launch",
      hint: "1 launch each would be 100%; lower means repetition",
      tone: theme.isOrganic ? "acid" : "bad",
    },
    { v: ago(theme.ageMinutes * 60), l: "age", hint: "since the first launch here" },
    {
      v: `${Math.round(theme.peakVelocity)}/hr`,
      l: "peak launch rate",
      hint: "the fastest hour this cluster has seen",
    },
    {
      v: `${dupePct}%`,
      l: "near-copies",
      hint: "carry a duplicate or impersonation flag",
      tone: dupePct > 50 ? "warn" : undefined,
    },
    {
      v: `${totalBuy.toFixed(2)}Ξ`,
      l: "creator stake",
      hint: "ETH creators put into their own launches",
      tone: totalBuy > 0 ? "acid" : undefined,
    },
  ]

  return (
    <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((m) => (
        <div key={m.l} className="border-t border-edge pt-4">
          <div
            className={`font-display text-2xl font-bold leading-none ${
              m.tone === "acid" ? "text-acid-500" : m.tone === "bad" ? "text-danger" : m.tone === "warn" ? "text-warn" : "text-fg"
            }`}
          >
            {m.v}
          </div>
          <div className="mt-1.5 text-xs text-fg-muted">{m.l}</div>
          <div className="mt-1 text-xs leading-snug text-fg-dim">{m.hint}</div>
        </div>
      ))}
    </div>
  )
}

/* Inline SVG sparkline — no chart library, no external request. */
function Velocity({ series }: { series: Detail["series"] }) {
  const path = useMemo(() => {
    if (!series || series.length < 2) return null
    const W = 600, H = 80, pad = 4
    const vals = series.map((s) => s.velocity || 0)
    const peak = Math.max(...vals) || 1
    // 25% headroom: without it a flat series (normal for a young theme) pins to
    // the top edge and the fill becomes a solid rectangle that reads as broken.
    const max = peak * 1.25
    const step = (W - pad * 2) / (vals.length - 1)
    const pts = vals.map((v, i) => [pad + i * step, H - pad - (v / max) * (H - pad * 2)] as const)
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ")
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${H - pad} L${pad} ${H - pad} Z`
    return { line, area, peak, W, H, n: series.length }
  }, [series])

  return (
    <div className="mb-9 border-y border-edge py-5">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-fg">Launch velocity</span>
        <span className="text-xs text-fg-dim">
          {path ? `peak ${Math.round(path.peak)}/hr · ${path.n} samples` : ""}
        </span>
      </div>
      {!path ? (
        <p className="py-5 text-center text-xs text-fg-dim">
          Not enough history yet — velocity is sampled as the watcher runs, so this fills in over
          the theme&apos;s first minutes.
        </p>
      ) : (
        <svg viewBox={`0 0 ${path.W} ${path.H}`} preserveAspectRatio="none" className="block h-20 w-full" role="img" aria-label="Launch velocity over time">
          <defs>
            <linearGradient id="vel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#cdff4d" stopOpacity=".28" />
              <stop offset="100%" stopColor="#cdff4d" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={path.area} fill="url(#vel)" />
          <path d={path.line} fill="none" stroke="#cdff4d" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </div>
  )
}

function Creators({ launches }: { launches: Launch[] }) {
  const rows = useMemo(() => {
    const counts = new Map<string, number>()
    launches.forEach((l) => counts.set(l.creator, (counts.get(l.creator) || 0) + 1))
    return [...counts.entries()]
      .map(([wallet, n]) => ({ wallet, n }))
      .sort((a, b) => b.n - a.n)
  }, [launches])

  const max = rows[0]?.n || 1

  return (
    <section className="mb-7">
      <SectionHead title="Who is launching into this" note={`${rows.length} total`} />
      <div className="flex flex-col gap-2">
        {rows.slice(0, 12).map((r) => {
          const share = r.n / launches.length
          return (
            /* Goes to NewEra's own record now, not to a block explorer.
               This is the exact place a reader asks "who is this?", and the
               answer — how many tokens the address has deployed, across how
               many clusters, how much of it duplicates — is one endpoint away
               and was being handed to a tool that cannot provide it. */
            <Link
              key={r.wallet}
              to={`/app/creator/${r.wallet}`}
              aria-label={`Deployer ${r.wallet}, ${r.n} launches in this cluster`}
              className="scan-row flex items-center gap-3 border-b border-edge py-3 pl-3"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-[#c8cdd6]">
                {shortAddr(r.wallet)}
              </span>
              <span className="h-[5px] w-[90px] flex-none overflow-hidden rounded-full bg-white/[.07]">
                <span
                  className={`block h-full rounded-full ${share > 0.5 ? "bg-danger" : "bg-acid-500"}`}
                  style={{ width: `${Math.round((r.n / max) * 100)}%` }}
                />
              </span>
              <span className="flex-none text-xs text-fg-dim">
                {r.n} launch{r.n === 1 ? "" : "es"}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

/* The launches, and whether any of them has a market.
 *
 * This page was the end of the road. A reader followed the feed to a cluster
 * that looked like it was forming, arrived here, and found counts, flags and a
 * verdict — with no way to tell whether a single one of these tokens could be
 * bought, and nothing to do next. That is the point in the journey where the
 * product stops being useful, so the market layer belongs here too.
 *
 * A link inside a link is invalid and unreachable by keyboard, so the row is a
 * container holding the explorer link and the market handoff separately. */
function Launches({ launches }: { launches: Launch[] }) {
  const markets = useMarkets(useMemo(() => launches.map((l) => l.address), [launches]))
  const status = markets === null ? "loading" : markets.ok ? "ok" : "down"
  const withMarket =
    markets && markets.ok
      ? launches.filter((l) => markets.markets.get(l.address.toLowerCase())?.liquidityUsd).length
      : null

  return (
    <section>
      <SectionHead
        title="Launches"
        note={
          withMarket === null
            ? `${launches.length} shown`
            : `${launches.length} shown · ${withMarket} tradeable`
        }
      />
      <div className="flex flex-col gap-2">
        {launches.length === 0 ? (
          <EmptyState>No launches recorded for this cluster.</EmptyState>
        ) : (
          launches.map((l) => (
            <div
              key={l.address}
              className={`scan-row relative border-b py-3 pl-3 ${
                l.riskScore >= 40 ? "border-l-2 border-l-danger/55 border-edge" : "border-edge"
              }`}
            >
              <div className="grid grid-cols-[3.4rem_minmax(0,1fr)_auto] items-baseline gap-3">
                <div className="text-right font-mono text-xs text-fg-dim">{ago(l.ageSeconds)}</div>
                <a
                  href={`${EXPLORER}/token/${l.address}`}
                  target="_blank"
                  rel="noopener"
                  className="min-w-0"
                >
                  <div className="truncate font-mono text-sm font-semibold">{l.symbol || "—"}</div>
                  <div className="truncate text-xs text-fg-dim">{l.name}</div>
                </a>
                <div className="flex flex-none items-center gap-2">
                  {l.devBuyEth > 0 && (
                    <span className="font-mono text-micro text-acid-500">
                      {l.devBuyEth.toFixed(2)}Ξ
                    </span>
                  )}
                  {(l.spoofFlags || []).slice(0, 2).map((f) => (
                    <FlagPill key={f} flag={f} />
                  ))}
                  <RiskPill score={l.riskScore} />
                </div>
              </div>
              <div className="mt-1.5 pl-[4.4rem]">
                <MarketLine market={markets?.markets.get(l.address.toLowerCase())} status={status} />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-base font-bold">{title}</h2>
      {note && <span className="text-xs text-fg-dim">{note}</span>}
    </div>
  )
}
