import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { getJSON, ago } from "@/lib/api"
import type { Launch, Stats, Theme } from "@/lib/api"
import { ClusterRow, Toggle, Skeleton, EmptyState } from "@/components/intel"
import { LaunchTable } from "@/components/LaunchTable"
import { Page } from "@/components/shell"
import { KineticText } from "@/components/kinetic"
import { useMarkets } from "@/lib/markets"

const REFRESH_MS = 12000

/* The Operate surface.
 *
 * THIS PAGE ANSWERS A QUESTION BEFORE IT SHOWS A TABLE. It used to open with a
 * ruled row of five raw figures and then two independently scrolling panes side
 * by side, each with its own inner scrollbar. Everything the index knows was on
 * screen and none of it was saying anything: it read as a terminal, and a
 * terminal assumes the reader already knows which number matters. Reported as
 * cluttered - the same data, decorated.
 *
 * So it is ordered as an argument instead, and the page scrolls as one:
 *
 *   1. THE READ. What the last hour actually looks like, as a sentence with the
 *      figures inside it. A reader who leaves here has still learned something.
 *   2. WORTH LOOKING AT. The few clusters where independent wallets are
 *      launching, which is the one judgement this product is built to make,
 *      each with the reason spelled out rather than encoded in a badge.
 *   3. EVERYTHING LAUNCHING. The raw tape, under a heading that says it is raw,
 *      with the filters attached to it rather than floating above the page.
 *
 * The nested `max-h-[74vh] overflow-y-auto` panes are gone. A scroll area inside
 * a scrolling page is the single most dashboard-like thing a layout can do: it
 * hides its own contents, fights the page, and was the source of the standing
 * `first-viewport-column-overflow` finding. */

export default function Feed() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [themes, setThemes] = useState<Theme[] | null>(null)
  const [launches, setLaunches] = useState<Launch[] | null>(null)
  const [includeSolo, setIncludeSolo] = useState(false)
  const [hideRisky, setHideRisky] = useState(false)
  const [byRisk, setByRisk] = useState(false)
  const [failures, setFailures] = useState(0)

  /* Updates wait for the reader.
   *
   * The poll used to replace both lists in place every twelve seconds. Measured
   * with no input at all over 105 seconds: the page drifted from y=3324 to
   * y=4903, the row under the cursor changed twice, and the two top clusters
   * were evicted. The tape is capped at thirty and prepends, so whatever you
   * were reading is pushed off the end — you cannot click what you just read,
   * and with no search a cluster that scrolls away is unrecoverable.
   *
   * So a poll that arrives while you are reading is held, not applied, and the
   * count of what is waiting is offered as a control. "Reading" is simply: not
   * at the top of the page. At the top there is nothing to lose, so it applies
   * straight away and the feed still feels live. */
  const [pending, setPending] = useState<{ themes: Theme[]; launches: Launch[] } | null>(null)
  const atTop = useRef(true)
  const shown = useRef(false)

  useEffect(() => {
    const onScroll = () => {
      atTop.current = window.scrollY < 240
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const load = useCallback(async () => {
    // allSettled, not all: the three panels are independent, and a failing
    // stats query must not blank a perfectly good feed.
    const [s, t, f] = await Promise.allSettled([
      getJSON<Stats>("/intel/stats"),
      getJSON<{ items: Theme[] }>(`/intel/themes?limit=24${includeSolo ? "" : "&organicOnly=1"}`),
      getJSON<{ items: Launch[] }>(`/intel/feed?limit=30${hideRisky ? "&maxRisk=25" : ""}`),
    ])

    // Figures are safe to update live: they occupy a fixed box and nobody is
    // mid-click on a percentage.
    if (s.status === "fulfilled") setStats(s.value)

    const nextThemes = t.status === "fulfilled" ? t.value.items : null
    const nextLaunches = f.status === "fulfilled" ? f.value.items : null

    /* Decided out here, not inside a state updater. Queueing `setPending` from
       within `setLaunches` is a side effect in a reducer — React is free to run
       it twice, and does under StrictMode. `shown` tracks whether anything is
       on screen yet without having to read state inside the updater. */
    const firstFill = !shown.current
    if (nextLaunches && (firstFill || atTop.current)) {
      setLaunches(nextLaunches)
      if (nextThemes) setThemes(nextThemes)
      setPending(null)
      shown.current = true
    } else if (nextLaunches && nextThemes) {
      setPending({ themes: nextThemes, launches: nextLaunches })
    }

    const failed = [s, t, f].filter((r) => r.status === "rejected").length
    setFailures((n) => (failed === 3 ? n + 1 : 0))
  }, [includeSolo, hideRisky])

  const applyPending = useCallback(() => {
    setPending((p) => {
      if (p) {
        setThemes(p.themes)
        setLaunches(p.launches)
      }
      return null
    })
  }, [])

  /* A filter change is the reader asking for a different set, so it must never
     be held back. */
  useEffect(() => {
    setPending(null)
    // A different set is being requested, so the next response is not an
    // interruption — let it land even if the reader is scrolled down.
    shown.current = false
  }, [includeSolo, hideRisky])

  /* How many of the held launches are ones the reader has not seen. */
  const waiting = useMemo(() => {
    if (!pending || !launches) return 0
    const seen = new Set(launches.map((l) => l.address))
    return pending.launches.filter((l) => !seen.has(l.address)).length
  }, [pending, launches])

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

  /* Ranked by how fast independent wallets are arriving, not by how many have.
   *
   * Sorting on raw creator count ranked by SIZE, and on a feed of things that
   * only ever grow, size is a proxy for AGE. Opening the top six under that
   * order returned five the product itself described as already crowded or
   * effectively over — the section meant to answer "what is forming right now"
   * was reliably pointing at what had already formed.
   *
   * The rate is what separates them: ten independent wallets in twenty minutes
   * is a narrative forming; a hundred and thirty over a day is one that formed
   * yesterday. `+15` in the denominator damps the first minutes, where a
   * two-wallet cluster would otherwise post a huge rate off almost no evidence.
   *
   * This does NOT use `status`. Every cluster on the chain currently reports
   * EMERGING — verified again today across both the list and detail endpoints,
   * 12 of 12 — so the field cannot order anything, and retuning its thresholds
   * is a product decision rather than a display one. */
  const clusters = useMemo(() => {
    if (!themes) return null
    const forming = (t: Theme) => t.creatorCount / (t.ageMinutes + 15)
    return [...themes]
      .filter((t) => t.launchCount >= 2)
      .sort((a, b) => forming(b) - forming(a) || b.creatorCount - a.creatorCount)
  }, [themes])

  const tape = useMemo(() => {
    if (!launches) return null
    if (!byRisk) return launches
    return [...launches].sort(
      (a, b) =>
        b.riskScore - a.riskScore ||
        b.dupeCount - a.dupeCount ||
        (b.spoofFlags?.length || 0) - (a.spoofFlags?.length || 0)
    )
  }, [launches, byRisk])

  /* Which of these actually have a market. Keyed off the tape's addresses, so
     one batched call covers both the section below and every row. */
  const markets = useMarkets(useMemo(() => (launches || []).map((l) => l.address), [launches]))

  /* Traded, ranked by how much. This is the section the feed did not have: it
     showed what launched and how spammy it looked, and nothing at all about
     whether a token had traction — which is most of what a reader is there to
     find out. Ordered by 24h volume because that is the question being asked.
     A single seed trade is not traction, so it has to clear both a volume and
     a trade-count floor. */
  const traded = useMemo(() => {
    if (!launches || !markets) return null
    return launches
      .map((l) => ({ launch: l, market: markets.markets.get(l.address.toLowerCase()) }))
      /* `liquidityUsd` has to be in the predicate because MarketLine refuses to
         render without it — a drained pool with past volume satisfied this
         filter and then printed "No market yet" on the row directly beneath its
         own heading. The two must agree on what "tradeable" means. */
      .filter(
        (r) =>
          r.market &&
          (r.market.liquidityUsd ?? 0) > 0 &&
          (r.market.volume24h ?? 0) > 0 &&
          (r.market.txns24h ?? 0) > 1
      )
      .sort((a, b) => (b.market!.volume24h ?? 0) - (a.market!.volume24h ?? 0))
  }, [launches, markets])

  const marketsDown = markets !== null && !markets.ok
  const marketStatus = markets === null ? "loading" : markets.ok ? "ok" : "down"

  /* Freshness is the age of the newest thing indexed, not the watcher's pulse.
   *
   * This read `lastIngestAt` — when the watcher last RAN — so it showed "● Live"
   * in green whenever the process was alive, regardless of how far behind the
   * chain it was. Measured today: the watcher had ticked 60 seconds ago while
   * the newest launch on the tape was 379 seconds old, and the page called that
   * live. The product's whole pitch is the first minutes of a token's life, so
   * overstating freshness is the least affordable claim on the page.
   *
   * Two separate facts, reported separately: how far behind the index is, and
   * whether the indexer is running at all. */
  const dataAgeSeconds = launches?.length ? launches[0].ageSeconds : null
  const heartbeatSeconds = stats?.lastIngestAt
    ? Math.floor((Date.now() - new Date(stats.lastIngestAt).getTime()) / 1000)
    : null
  const indexerUp = heartbeatSeconds !== null && heartbeatSeconds < 180
  const live = indexerUp && dataAgeSeconds !== null && dataAgeSeconds < 120

  return (
    <Page>
      {/* Held updates, offered rather than applied. Fixed to the bottom so it
          is reachable from wherever the reader is, and announced politely so a
          screen reader is told the feed has moved on without the list changing
          under the virtual cursor. */}
      {pending && waiting > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[4vh] z-40 flex justify-center px-[4vw]">
          <button
            type="button"
            onClick={applyPending}
            className="block-btn pointer-events-auto border border-acid-500 bg-acid-500 font-semibold text-ink-950"
          >
            Show {waiting} new {waiting === 1 ? "launch" : "launches"} ↑
          </button>
        </div>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {pending && waiting > 0
          ? `${waiting} new launches available. The list is paused while you read.`
          : ""}
      </p>
      <KineticText
        as="h1"
        className="font-display max-w-[14ch] text-[clamp(2rem,5.2vw,4.2rem)] font-extrabold uppercase leading-[0.9] tracking-[-0.03em]"
        base={72}
      >
        Live launch intelligence
      </KineticText>

      {/* Under the heading, not above it. A short label stacked over an h1 is a
          kicker, which the direction bans outright and the detector catches. */}
      <p className="mt-5 font-mono text-micro uppercase tracking-[0.14em]">
        {/* "Live" is a claim. Only make it when the data supports it. */}
        <span className={live ? "text-acid-500" : "text-warn"}>
          {stats === null
            ? "Connecting…"
            : !indexerUp
              ? "Indexer offline"
              : live
                ? "● Live"
                : dataAgeSeconds === null
                  ? "Waiting for the index"
                  : `Indexed through ${ago(dataAgeSeconds)} ago`}
        </span>
      </p>

      <TheRead stats={stats} clusters={clusters} failed={failures >= 1} />

      {/* ── 2. What is worth looking at ─────────────────────────────────── */}
      <section className="mt-[9vh]">
        <SectionHead
          title="Worth looking at"
          note={clusters ? `${clusters.length} listed` : "…"}
        />
        <p className="measure mt-4 text-sm leading-relaxed text-fg-muted">
          Clusters where more than one wallet is launching. That is the only thing separating a
          narrative that is forming from one address repeating itself. It is a statement about who
          is launching, not a prediction about price.
        </p>
        <p className="measure mt-3 text-sm leading-relaxed text-fg-dim">
          Ordered by how fast independent wallets are arriving, so the ones still forming come
          first. Ranking by total size would put the oldest and most crowded at the top.
        </p>

        {/* A grid, not a column. These are short comparable blocks, and one per
            row left two thirds of the width empty while making the reader scroll
            to compare the third cluster against the first. */}
        <div className="mt-7 grid border-t border-edge lg:grid-cols-2 lg:gap-x-10 xl:grid-cols-3">
          {failures >= 1 && clusters === null ? (
            <EmptyState>
              The intelligence API is not responding, so there is nothing to rank here yet.
            </EmptyState>
          ) : clusters === null ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h={110} />)
          ) : clusters.length === 0 ? (
            <EmptyState>
              {includeSolo
                ? "Nothing with two or more launches in this window. The indexer may still be warming up."
                : "No cluster right now has more than one wallet launching into it — every active one is a single address repeating itself. Turn on one-wallet clusters below to see them anyway."}
            </EmptyState>
          ) : (
            clusters.map((t) => <ClusterRow key={t.id} theme={t} />)
          )}
        </div>

        <div className="mt-5">
          <Toggle on={includeSolo} onClick={() => setIncludeSolo((v) => !v)}>
            Include one-wallet clusters
          </Toggle>
        </div>
      </section>

      {/* ── 3. What has a market ────────────────────────────────────────── */}
      <section className="mt-[11vh]">
        <SectionHead
          title="Getting traded"
          note={traded ? `${traded.length} of ${launches?.length ?? 0}` : "…"}
        />
        <p className="measure mt-4 text-sm leading-relaxed text-fg-muted">
          Of the launches below, these are the ones somebody is actually trading. Liquidity, volume
          and price come from DexScreener, which indexes both DEXes on this chain.{" "}
          <b className="font-semibold text-fg">NewEra never holds your funds or your keys</b> —
          where a swap is offered it is signed by your own wallet and settles on Uniswap.
        </p>

        <div className="mt-7">
          {marketsDown ? (
            <EmptyState>
              Market data is unavailable right now, so we cannot say what is trading. This is a
              lookup failure on our side, not a statement about these tokens.
            </EmptyState>
          ) : traded === null ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} h={64} />)
          ) : traded.length === 0 ? (
            <EmptyState>
              Nothing in this window has a market yet. That is the normal state of a new launch, and
              the reason this page exists: you are seeing them before they have a price.
            </EmptyState>
          ) : (
            <LaunchTable rows={traded} caption="Launches with a live market, deepest first" />
          )}
        </div>
      </section>

      {/* ── 4. The raw tape ─────────────────────────────────────────────── */}
      <section className="mt-[11vh]">
        <SectionHead title="Everything launching" note={tape ? `${tape.length} shown` : "…"} />
        <p className="measure mt-4 text-sm leading-relaxed text-fg-muted">
          Unfiltered, newest first, straight from the index. Most of it is noise. That is the point
          of the section above.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Toggle on={hideRisky} onClick={() => setHideRisky((v) => !v)}>
            Hide likely spam
          </Toggle>
          <Toggle on={byRisk} onClick={() => setByRisk((v) => !v)}>
            {byRisk ? "Riskiest first" : "Newest first"}
          </Toggle>
        </div>

        {/* The scale, stated. The column heading named the number but not what
            it meant, and the only explanation of the thresholds was a `title`
            on a non-focusable span — invisible on touch, unannounced by screen
            readers, and absent for anyone who simply does not hover. */}
        {/* The threshold stated here has to be the one the control uses. I
            first wrote "40 and over is the band Hide likely spam removes",
            which was wrong: the request is `maxRisk=25`, so the toggle is
            stricter than the documented high band and also removes the upper
            half of the medium one. Describing the control's real behaviour
            rather than the band boundary. */}
        <p className="measure mt-6 font-mono text-xs leading-relaxed text-fg-dim">
          Spam risk runs 0–100: higher means the launch looks more
          machine-generated. Under 15 is clean, 40 and over is high.{" "}
          <span className="text-fg-muted">Hide likely spam</span> is stricter than that line — it
          removes anything above 25. It is not a price forecast.
        </p>

        <div>
          {/* Failure is checked BEFORE the null case. Ordered the other way,
              `tape === null` matched first on a cold outage and the honest
              message below was unreachable on the one path that needed it —
              the page pulsed sixteen skeletons and said "Connecting…" forever. */}
          {failures >= 1 && tape === null ? (
            <EmptyState>
              The intelligence API is not responding. This page retries every 12 seconds — leave it
              open and it will fill in when the index is back.
            </EmptyState>
          ) : tape === null ? (
            Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} />)
          ) : failures >= 3 ? (
            <EmptyState>
              Lost contact with the intelligence API. The rows below are the last good read.
            </EmptyState>
          ) : tape.length === 0 ? (
            <EmptyState>Nothing indexed in this window yet.</EmptyState>
          ) : (
            <LaunchTable
              rows={tape.map((l) => ({
                launch: l,
                market: markets?.markets.get(l.address.toLowerCase()),
              }))}
              marketStatus={marketStatus}
              caption="Every launch in the current window, newest first"
            />
          )}
        </div>

        <p className="mt-6 text-sm text-fg-dim">
          Scores explained on{" "}
          <Link to="/detection" className="scan-link text-acid-500">
            how detection works
          </Link>
          .
        </p>
      </section>
    </Page>
  )
}

/* The read.
 *
 * Five figures in a row is a readout: it hands the reader the numbers and the
 * job of interpreting them. The same figures inside a sentence are a finding.
 * Every number here is live and none of it is rounded into a claim the backtest
 * does not support. */
function TheRead({
  stats,
  clusters,
  failed,
}: {
  stats: Stats | null
  clusters: Theme[] | null
  failed: boolean
}) {
  if (!stats) {
    return (
      <div className="mt-9 border-y border-edge py-7">
        {failed ? (
          <p className="text-base leading-relaxed text-warn">
            The index is not answering, so there is nothing measured to report here. This page
            retries every 12 seconds.
          </p>
        ) : (
          <Skeleton h={72} />
        )}
      </div>
    )
  }

  const n = clusters?.length ?? 0
  return (
    <div className="mt-9 border-y border-edge py-7">
      <p className="max-w-[46ch] text-[clamp(1.05rem,1.7vw,1.4rem)] leading-[1.55] text-fg">
        <Fig>{stats.launchesLastHour.toLocaleString("en-US")}</Fig> tokens were created in the last
        hour. <Fig tone={stats.duplicatePct > 30 ? "warn" : undefined}>{stats.duplicatePct}%</Fig>{" "}
        {/* `duplicatePct` counts any deception flag — copies, lookalike
            characters, invisible characters — not near-duplicates alone. The
            backend picked that definition deliberately; the copy just did not
            match it. */}
        carry a duplicate or impersonation flag, and{" "}
        <Fig tone={stats.highRiskPct > 10 ? "warn" : undefined}>{stats.highRiskPct}%</Fig> score as
        manufactured noise.{" "}
        {/* Three states. `clusters == null` means the request failed or is in
            flight, and collapsing that into "no clusters" printed a finding
            about the chain that was really a network error. Say nothing rather
            than something untrue. */}
        {clusters === null ? null : n > 0 ? (
          <>The clusters below are the ones with independent wallets behind them.</>
        ) : (
          <>No cluster right now has independent wallets launching into it.</>
        )}
        {/* Deliberately no total here. The count of clusters on this page is the
            page size of a `limit=` fetch, not a measurement of the chain, and a
            figure that cannot be reproduced from a live call has no business
            being stated as one. The section heading below says how many are
            listed, which is a claim about this page and is true. */}
      </p>
      {/* Not uppercased: this is a sentence's worth of running text, and forcing
          caps on it is what the detector's all-caps-body rule catches. Caps are
          for labels. */}
      <p className="mt-4 font-mono text-xs tracking-[0.04em] text-fg-dim">
        {stats.distinctCreators24h.toLocaleString("en-US")} distinct creators ·{" "}
        {stats.launchesLast24h.toLocaleString("en-US")} launches · last 24h
      </p>
    </div>
  )
}

function Fig({ children, tone }: { children: React.ReactNode; tone?: "warn" | "signal" }) {
  return (
    <span
      className={`font-mono font-medium tabular-nums ${
        tone === "warn" ? "text-warn" : tone === "signal" ? "text-acid-500" : "text-fg"
      }`}
    >
      {children}
    </span>
  )
}

function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-edge pb-3">
      <h2 className="text-xl font-semibold text-fg">{title}</h2>
      <span className="font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">{note}</span>
    </div>
  )
}
