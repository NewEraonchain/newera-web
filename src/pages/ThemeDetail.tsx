import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { getJSON, ago, shortAddr } from "@/lib/api"
import type { Launch, Theme } from "@/lib/api"
import { StatusBadge, RiskPill, FlagPill, EXPLORER, EmptyState, Skeleton } from "@/components/intel"

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
            ? "That theme no longer exists, or was never indexed."
            : e.message,
        ),
      )
  }, [slug])

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
        <h1 className="font-display text-[clamp(1.4rem,3vw,2rem)] font-bold tracking-[-0.02em] [overflow-wrap:anywhere]">
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
    <div className="mx-auto max-w-4xl px-5 pb-24 pt-10">
      <Link
        to="/app"
        className="mb-5 inline-flex items-center gap-2 text-[13px] text-fg-dim transition-colors hover:text-acid-500"
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
        <b>Already crowded.</b> {theme.launchCount} launches and velocity is falling from a peak of{" "}
        {Math.round(theme.peakVelocity)}/hr. The move here, if there was one, has mostly happened.
      </>
    )
  } else if (theme.status === "DECAYING") {
    tone = "warn"
    body = <><b>Effectively over.</b> Almost nothing new is launching into this theme.</>
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

  return (
    <div className={`mb-6 rounded-2xl border p-4 text-[13.5px] leading-relaxed ${style}`}>
      <span className="[&_b]:text-fg">{body}</span>
    </div>
  )
}

function Metrics({ theme, launches }: { theme: Theme; launches: Launch[] }) {
  const flagged = launches.filter((l) => (l.spoofFlags || []).length > 0).length
  const totalBuy = launches.reduce((a, l) => a + (l.devBuyEth || 0), 0)
  const dupePct = launches.length ? Math.round((flagged / launches.length) * 100) : 0

  const items = [
    { v: theme.launchCount, l: "launches" },
    { v: theme.creatorCount, l: "distinct creators", tone: theme.isOrganic ? "acid" : "bad" },
    { v: `${Math.round(theme.organicRatio * 100)}%`, l: "creator diversity", tone: theme.isOrganic ? "acid" : "bad" },
    { v: ago(theme.ageMinutes * 60), l: "age" },
    { v: `${Math.round(theme.peakVelocity)}/hr`, l: "peak velocity" },
    { v: `${dupePct}%`, l: "near-duplicates", tone: dupePct > 50 ? "warn" : undefined },
    { v: `${totalBuy.toFixed(2)}Ξ`, l: "total dev buy", tone: totalBuy > 0 ? "acid" : undefined },
  ]

  return (
    <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((m) => (
        <div key={m.l} className="rounded-2xl border border-edge bg-white/[.03] px-4 py-4">
          <div
            className={`font-display text-[23px] font-bold leading-none ${
              m.tone === "acid" ? "text-acid-500" : m.tone === "bad" ? "text-danger" : m.tone === "warn" ? "text-warn" : "text-fg"
            }`}
          >
            {m.v}
          </div>
          <div className="mt-1.5 text-[11.5px] text-fg-dim">{m.l}</div>
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
    <div className="mb-7 rounded-2xl border border-edge bg-white/[.025] px-5 pb-3 pt-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[13.5px] font-semibold text-fg">Launch velocity</span>
        <span className="text-[11.5px] text-fg-dim">
          {path ? `peak ${Math.round(path.peak)}/hr · ${path.n} samples` : ""}
        </span>
      </div>
      {!path ? (
        <p className="py-5 text-center text-[12.5px] text-fg-dim">
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
            <a
              key={r.wallet}
              href={`${EXPLORER}/address/${r.wallet}`}
              target="_blank"
              rel="noopener"
              title={`View ${r.wallet} on Blockscout`}
              className="flex items-center gap-3 rounded-xl border border-edge bg-white/[.022] px-3.5 py-2.5 transition-colors hover:border-edge-strong"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-[#c8cdd6]">
                {shortAddr(r.wallet)}
              </span>
              <span className="h-[5px] w-[90px] flex-none overflow-hidden rounded-full bg-white/[.07]">
                <span
                  className={`block h-full rounded-full ${share > 0.5 ? "bg-danger" : "bg-acid-500"}`}
                  style={{ width: `${Math.round((r.n / max) * 100)}%` }}
                />
              </span>
              <span className="flex-none text-[12px] text-fg-dim">
                {r.n} launch{r.n === 1 ? "" : "es"}
              </span>
            </a>
          )
        })}
      </div>
    </section>
  )
}

function Launches({ launches }: { launches: Launch[] }) {
  return (
    <section>
      <SectionHead title="Launches" note={`${launches.length} shown`} />
      <div className="flex flex-col gap-2">
        {launches.length === 0 ? (
          <EmptyState>No launches recorded for this theme.</EmptyState>
        ) : (
          launches.map((l) => (
            <a
              key={l.address}
              href={`${EXPLORER}/token/${l.address}`}
              target="_blank"
              rel="noopener"
              className={`grid grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-white/[.022] px-3.5 py-3 transition-colors hover:border-edge-strong ${
                l.riskScore >= 40 ? "border-l-2 border-l-danger/55 border-edge" : "border-edge"
              }`}
            >
              <div className="text-right font-mono text-[11.5px] text-fg-dim">{ago(l.ageSeconds)}</div>
              <div className="min-w-0">
                <div className="truncate font-mono text-[13.5px] font-semibold">{l.symbol || "—"}</div>
                <div className="truncate text-[12px] text-fg-dim">{l.name}</div>
              </div>
              <div className="flex flex-none items-center gap-2">
                {l.devBuyEth > 0 && (
                  <span className="rounded-md bg-acid-500/10 px-[7px] py-[3px] font-mono text-[11px] text-acid-500">
                    {l.devBuyEth.toFixed(2)}Ξ
                  </span>
                )}
                {(l.spoofFlags || []).slice(0, 2).map((f) => (
                  <FlagPill key={f} flag={f} />
                ))}
                <RiskPill score={l.riskScore} />
              </div>
            </a>
          ))
        )}
      </div>
    </section>
  )
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-[15px] font-bold">{title}</h2>
      {note && <span className="text-[12px] text-fg-dim">{note}</span>}
    </div>
  )
}
