import { useCallback, useEffect, useRef, useState } from "react"
import { getJSON, ago } from "@/lib/api"
import type { Launch, Stats, Theme } from "@/lib/api"
import { LaunchRow, ThemeCard, Toggle, Skeleton, EmptyState } from "@/components/intel"
import { Rise, Wipe, Stagger } from "@/components/scroll"

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
    <div className="px-[4vw] pb-[14vh] pt-[13vh]">
      <header className="grid gap-x-12 gap-y-6 md:grid-cols-[10rem_1fr]">
        <p className="font-mono text-micro uppercase tracking-[0.14em] text-fg-dim md:pt-3">
          {/* "Live" is a claim — only make it when the data supports it. */}
          <span className={live ? "text-acid-500" : "text-warn"}>
            {stats === null
              ? "Connecting…"
              : live
                ? "● Live"
                : lagSeconds === null
                  ? "Indexer offline"
                  : `Delayed ${ago(lagSeconds)}`}
          </span>
        </p>

        <Rise>
          <h1
            className="font-display max-w-[14ch] text-[clamp(2rem,5.2vw,4.2rem)] font-extrabold uppercase leading-[0.9] tracking-[-0.03em]"
            style={{ fontStretch: "72%" }}
          >
            Live launch intelligence
          </h1>
          <p className="measure mt-6 text-base leading-relaxed text-fg-muted">
            Every token created on Robinhood Chain, grouped by what it means — not by what it has
            traded. A cluster is only a narrative when independent wallets launch into it, so
            creator count sits beside every launch count.
          </p>
        </Rise>
      </header>

      {/* The measurements, as a ruled row. Five bordered boxes was the single
          most dashboard-like thing on the page. */}
      <Stagger as="dl" className="mt-[7vh] flex flex-wrap gap-x-14 gap-y-6 border-y border-edge py-6" each={0.08}>
        {stats === null
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h={48} />)
          : [
              { v: stats.launchesLastHour, l: "launches / last hour", accent: true },
              { v: stats.activeThemes, l: "clusters active now" },
              { v: stats.distinctCreators24h, l: "distinct creators / 24h" },
              { v: `${stats.duplicatePct}%`, l: "near-duplicates / 24h", warn: stats.duplicatePct > 30 },
              { v: `${stats.highRiskPct}%`, l: "high-risk / 24h", warn: stats.highRiskPct > 10 },
            ].map((m) => (
              <div key={m.l}>
                <dt
                  className={`font-mono text-3xl font-medium leading-none ${
                    m.accent ? "text-acid-500" : m.warn ? "text-warn" : "text-fg"
                  }`}
                >
                  {m.v}
                </dt>
                <dd className="mt-2 font-mono text-micro uppercase tracking-[0.1em] text-fg-dim">
                  {m.l}
                </dd>
              </div>
            ))}
      </Stagger>

      {/* controls */}
      <Wipe className="mt-8 flex flex-wrap gap-3">
        <Toggle on={organicOnly} onClick={() => setOrganicOnly((v) => !v)}>
          Organic clusters only
        </Toggle>
        <Toggle on={hideRisky} onClick={() => setHideRisky((v) => !v)}>
          Hide high-risk launches
        </Toggle>
      </Wipe>

      <div className="mt-10 grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* themes */}
        <section>
          <PanelHead title="Clusters forming" count={themes ? `${themes.length} active` : "loading…"} />
          <Stagger className="border-t border-edge" each={0.05}>
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
          </Stagger>
        </section>

        {/* tape */}
        <section>
          <PanelHead title="Live tape" count={launches ? `${launches.length} shown` : "loading…"} />
          <div className="max-h-[78vh] overflow-y-auto border-t border-edge pr-1">
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
      <h2 className="font-mono text-micro uppercase tracking-[0.14em] text-fg">{title}</h2>
      <span className="font-mono text-micro text-fg-dim">{count}</span>
    </div>
  )
}
