import { useCallback, useEffect, useRef, useState } from "react"
import { getJSON, ago } from "@/lib/api"
import type { Launch, Stats, Theme } from "@/lib/api"
import { LaunchRow, ThemeCard, Toggle, Skeleton, EmptyState } from "@/components/intel"

const REFRESH_MS = 12000

export default function Feed() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [themes, setThemes] = useState<Theme[] | null>(null)
  const [launches, setLaunches] = useState<Launch[] | null>(null)
  const [organicOnly, setOrganicOnly] = useState(true)
  const [hideRisky, setHideRisky] = useState(false)
  const [failures, setFailures] = useState(0)

  // Tracks which addresses we've already shown so genuinely new rows can flash.
  const seen = useRef<Set<string>>(new Set())

  const load = useCallback(async () => {
    // allSettled, not all: the three panels are independent, and a failing
    // stats query must not blank a perfectly good feed.
    const [s, t, f] = await Promise.allSettled([
      getJSON<Stats>("/intel/stats"),
      getJSON<{ items: Theme[] }>(`/intel/themes?limit=14${organicOnly ? "&organicOnly=1" : ""}`),
      getJSON<{ items: Launch[] }>(`/intel/feed?limit=60${hideRisky ? "&maxRisk=25" : ""}`),
    ])

    if (s.status === "fulfilled") setStats(s.value)
    if (t.status === "fulfilled") setThemes(t.value.items)
    if (f.status === "fulfilled") setLaunches(f.value.items)

    const failed = [s, t, f].filter((r) => r.status === "rejected").length
    setFailures((n) => (failed === 3 ? n + 1 : 0))
  }, [organicOnly, hideRisky])

  useEffect(() => {
    load()
    const id = setInterval(load, REFRESH_MS)
    // Don't poll a tab nobody is looking at.
    const onVis = () => {
      if (document.hidden) clearInterval(id)
      else load()
    }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [load])

  // Changing the risk filter changes the set entirely; don't flash everything.
  useEffect(() => {
    seen.current.clear()
  }, [hideRisky])

  const lagSeconds = stats?.lastIngestAt
    ? Math.floor((Date.now() - new Date(stats.lastIngestAt).getTime()) / 1000)
    : null
  const live = lagSeconds !== null && lagSeconds < 120

  return (
    <div className="mx-auto max-w-[1320px] px-5 pb-24 pt-10">
      <header className="mb-6">
        <h1 className="flex flex-wrap items-center gap-3 font-display text-[clamp(1.5rem,3vw,2rem)] font-bold tracking-[-0.02em]">
          Live launch intelligence
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.05em] ${
              live
                ? "border-acid-500/30 bg-acid-500/10 text-acid-500"
                : "border-warn/30 bg-warn/10 text-warn"
            }`}
          >
            <span className={`h-[7px] w-[7px] rounded-full ${live ? "animate-pulse bg-acid-500" : "bg-warn"}`} />
            {/* "Live" is a claim — only make it when the data supports it. */}
            {stats === null
              ? "Connecting…"
              : live
                ? "Live"
                : lagSeconds === null
                  ? "Indexer offline"
                  : `Delayed ${ago(lagSeconds)}`}
          </span>
        </h1>
        <p className="measure mt-2 text-sm leading-relaxed text-fg-muted">
          Every token created on Robinhood Chain, grouped by what it means — not by what it has
          traded. A cluster is only a narrative when independent wallets launch into it, so creator
          count sits beside every launch count.
        </p>
      </header>

      {/* stat strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats === null
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h={82} />)
          : [
              { v: stats.launchesLastHour, l: "launches / last hour", accent: true },
              { v: stats.activeThemes, l: "themes active now" },
              { v: stats.distinctCreators24h, l: "distinct creators / 24h" },
              { v: `${stats.duplicatePct}%`, l: "near-duplicates / 24h", warn: stats.duplicatePct > 30 },
              { v: `${stats.highRiskPct}%`, l: "high-risk / 24h", warn: stats.highRiskPct > 10 },
            ].map((m) => (
              <div key={m.l} className="rounded-2xl border border-edge bg-white/[.03] px-4 py-4">
                <div
                  className={`font-display text-2xl font-bold leading-none tracking-[-0.02em] ${
                    m.accent ? "text-acid-500" : m.warn ? "text-warn" : "text-fg"
                  }`}
                >
                  {m.v}
                </div>
                <div className="mt-1.5 text-xs text-fg-dim">{m.l}</div>
              </div>
            ))}
      </div>

      {/* controls */}
      <div className="mb-5 flex flex-wrap gap-2.5">
        <Toggle on={organicOnly} onClick={() => setOrganicOnly((v) => !v)}>
          Organic themes only
        </Toggle>
        <Toggle on={hideRisky} onClick={() => setHideRisky((v) => !v)}>
          Hide high-risk launches
        </Toggle>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* themes */}
        <section>
          <PanelHead title="Themes forming" count={themes ? `${themes.length} active` : "loading…"} />
          <div className="flex flex-col gap-3">
            {themes === null ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={104} />)
            ) : themes.length === 0 ? (
              <EmptyState>
                {organicOnly
                  ? "No organic themes right now — every active cluster is one wallet repeating itself. Turn off the filter to see them."
                  : "No themes yet. The indexer may still be warming up."}
              </EmptyState>
            ) : (
              themes.map((t) => <ThemeCard key={t.id} theme={t} />)
            )}
          </div>
        </section>

        {/* tape */}
        <section>
          <PanelHead title="Live tape" count={launches ? `${launches.length} shown` : "loading…"} />
          <div className="flex max-h-[78vh] flex-col gap-2 overflow-y-auto pr-1">
            {launches === null ? (
              Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} />)
            ) : failures >= 3 ? (
              <EmptyState>Could not reach the intelligence API.</EmptyState>
            ) : launches.length === 0 ? (
              <EmptyState>Nothing indexed in this window yet.</EmptyState>
            ) : (
              launches.map((l) => {
                const isNew = seen.current.size > 0 && !seen.current.has(l.address)
                seen.current.add(l.address)
                return <LaunchRow key={l.address} launch={l} isNew={isNew} />
              })
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function PanelHead({ title, count }: { title: string; count: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-base font-bold text-fg">{title}</h2>
      <span className="text-xs text-fg-dim">{count}</span>
    </div>
  )
}
