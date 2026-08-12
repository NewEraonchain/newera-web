import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { getJSON, ago } from "@/lib/api"
import type { Launch, Stats, Theme } from "@/lib/api"
import { ClusterRow, Toggle, Skeleton, EmptyState } from "@/components/intel"
import { LaunchTable } from "@/components/LaunchTable"
import { Page, SectionHead } from "@/components/shell"
import { useMarkets, type Market } from "@/lib/markets"
import FeedFilters, { loadFilters, filtersToQuery, needsMeasurement, type Filters } from "@/components/FeedFilters"

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

/* How alive a market is right now, in dollars-weighted-by-recency.
 *
 * Not a score shown to anyone — only an ordering. A token doing $500 in the
 * last five minutes is more use to a reader than one that did $50,000 yesterday
 * and stopped, and 24h volume ranked them the other way round. */
function liveness(m: Market): number {
  const v5 = m.volume5m ?? 0
  const v1h = m.volume1h ?? 0
  const v24 = m.volume24h ?? 0
  return v5 * 12 + v1h * 2 + v24 * 0.05
}

/* The three questions this page answers, as one table's three states.
 *
 * Trading first, because "what can I actually buy right now" is what a visitor
 * arrives with. New is the raw tape and the product's proof — a launch visible
 * before it has a price. Clusters is the judgement nobody else makes, and it is
 * a different shape of answer, so it gets its own view rather than a wall of
 * blocks wedged between two tables. */
type View = "trading" | "new" | "clusters"

const VIEWS: { id: View; label: string }[] = [
  { id: "trading", label: "Trading" },
  { id: "new", label: "New" },
  { id: "clusters", label: "Clusters" },
]

const VIEW_KEY = "newera_feed_view"

function loadView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === "new" || v === "clusters" || v === "trading" ? v : "trading"
  } catch {
    return "trading"
  }
}

function saveView(v: View) {
  try {
    localStorage.setItem(VIEW_KEY, v)
  } catch {
    /* private mode — the choice still holds for this visit */
  }
}

export default function Feed() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [themes, setThemes] = useState<Theme[] | null>(null)
  const [launches, setLaunches] = useState<Launch[] | null>(null)
  const [includeSolo, setIncludeSolo] = useState(false)
  const [hideRisky, setHideRisky] = useState(false)
  /* Restored from the last visit — a filter set is a workspace, and rebuilding
     it on every arrival is why nobody uses filters twice. */
  const [filters, setFilters] = useState<Filters>(() => loadFilters())
  /* One page, three views — not three stacked sections.
     Stacked, the tape began at y=1951 and the cluster grid sat between two
     tables that are the same act of scanning. A terminal switches what the one
     table is showing; it does not make you scroll past the other answers. The
     choice persists because it is a workspace, not a navigation step. */
  const [view, setView] = useState<View>(() => loadView())
  const [measuredOnly, setMeasuredOnly] = useState(false)
  const [byRisk, setByRisk] = useState(false)
  const [failures, setFailures] = useState(0)
  /* Tracked separately from `failures`. That counter only increments when ALL
     THREE requests reject, so a stats-only outage left the masthead on
     "Connecting…" and the figure strip pulsing a skeleton forever — above a
     fully populated tape. A working page telling the reader it is still
     connecting is the same defect this file's own comments were written to
     prevent, one endpoint over. */
  const [statsFailed, setStatsFailed] = useState(false)

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
      getJSON<{ items: Theme[] }>("/intel/themes?limit=24&organicOnly=1"),
      /* The filters go to the DATABASE. Narrowing the thirty rows already in
         the browser would be a sort wearing a filter's clothes: ask for "over
         50 holders" and you would get however many of those thirty qualify,
         usually none, and conclude the chain was empty. `maxRisk` from the
         toggle stays unless the filter panel sets its own. */
      getJSON<{ items: Launch[]; measuredOnly?: boolean }>(
        `/intel/feed?limit=30${
          hideRisky && filters.maxRisk === null ? "&maxRisk=25" : ""
        }${filtersToQuery(filters)}`
      ),
    ])

    // Figures are safe to update live: they occupy a fixed box and nobody is
    // mid-click on a percentage.
    if (s.status === "fulfilled") {
      setStats(s.value)
      setStatsFailed(false)
    } else {
      setStatsFailed(true)
    }

    /* "Include one-wallet clusters" has to ADD, which meant a second request.
       It used to drop `organicOnly` from the same limit=24 query, so one-wallet
       clusters consumed the page budget and evicted the multi-wallet ones
       already on screen — measured 19 clusters before the toggle and 10 after,
       losing 14 to gain 8, under a control labelled "Include". Raising the limit
       does not fix it either: the server sorts and slices AFTER filtering, so
       the organic ones can still fall outside the window. Fetching both sets and
       merging is the only shape that matches the label. */
    let nextThemes = t.status === "fulfilled" ? t.value.items : null
    if (includeSolo && nextThemes) {
      const solo = await getJSON<{ items: Theme[] }>("/intel/themes?limit=100").catch(() => null)
      if (solo?.items) {
        const seen = new Set(nextThemes.map((x) => x.slug))
        nextThemes = [...nextThemes, ...solo.items.filter((x) => !seen.has(x.slug))]
      }
    }
    const nextLaunches = f.status === "fulfilled" ? f.value.items : null
    // The API says when a filter restricted the answer to measured tokens.
    if (f.status === "fulfilled") setMeasuredOnly(f.value.measuredOnly === true)

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
  }, [includeSolo, hideRisky, filters])

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
  }, [includeSolo, hideRisky, filters])

  /* How many of the held launches are ones the reader has not seen. */
  const waiting = useMemo(() => {
    if (!pending || !launches) return 0
    const seen = new Set(launches.map((l) => l.address))
    return pending.launches.filter((l) => !seen.has(l.address)).length
  }, [pending, launches])

  useEffect(() => {
    load()
    let id = setInterval(load, REFRESH_MS)

    /* Don't poll a tab nobody is looking at — but DO start again on return.
       The previous version cleared the interval when the tab went hidden and,
       on return, only called load() once. Nothing ever recreated the timer, so
       after a single tab switch the live feed silently became "refreshes once
       when you look at it" for the rest of the session — under a masthead whose
       whole job is to claim freshness. Measured: 0 polls in the 40s after
       returning to the tab, where three were due. Switching tabs is the most
       ordinary thing anyone does with a live feed. */
    const onVis = () => {
      clearInterval(id)
      if (!document.hidden) {
        load()
        id = setInterval(load, REFRESH_MS)
      }
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

  /* Traded, ranked by what is trading NOW.
   *
   * This is the section the feed did not have: it showed what launched and how
   * spammy it looked, and nothing about whether a token had traction — most of
   * what a reader is there to find out. A single seed trade is not traction, so
   * it still has to clear a volume and a trade-count floor.
   *
   * The RANK was the bug. Ordered by 24-hour volume, a token that traded
   * heavily twenty hours ago and has been dead since outranked one trading this
   * minute — and "Getting traded" is present tense. DexScreener returns m5 and
   * h1 in the same response we already make, so the ordering now prefers recent
   * activity and falls back to 24h only where the short windows are absent. */
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
      /* Recency-weighted: the last hour dominates, the last five minutes
         dominate that, and 24h only breaks ties between tokens that are equally
         quiet now. Weights rather than a strict sort so a token with one big
         recent trade does not leapfrog one with sustained volume. */
      .sort((a, b) => liveness(b.market!) - liveness(a.market!))
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
      {/* A masthead, not a cover.
          Measured before this change: 94% of the first viewport was prose and
          none of the 33 rows were visible — you arrived at a live feed and had
          to scroll a full screen before seeing anything live. Plate-scale
          display type belongs to the Persuade surfaces; this is the instrument,
          and its job is to get out of the way of the tape. */}
      {/* Masthead, search and status on ONE line. Search is chrome on an
          Operate surface — a control you reach for, not a thing to read — and
          stacked beneath the title it cost 60px of a first screen whose job is
          to show rows. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
        {/* No `flex-none`. Pinning the masthead's width stopped it shrinking at
            320px and pushed the page 38px sideways — a 1280 window at 400% zoom.
            It may shrink; it simply must not wrap mid-word. */}
        <h1 className="min-w-0 font-display text-[clamp(1.25rem,2.6vw,2.1rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.02em]">
          Live launch intelligence
        </h1>
        <div className="order-last w-full min-w-0 flex-1 lg:order-none lg:w-auto lg:max-w-[34rem]">
          <Search />
        </div>
        <span className={`font-mono text-micro uppercase tracking-[0.14em] ${live ? "text-acid-500" : "text-warn"}`}>
          {/* "Live" is a claim. Only make it when the data supports it. */}
          {stats === null
            ? statsFailed
              ? "Figures unavailable"
              : "Connecting…"
            : !indexerUp
              ? "Indexer offline"
              : live
                ? "● Live"
                : dataAgeSeconds === null
                  ? "Waiting for the index"
                  : `Indexed through ${ago(dataAgeSeconds)} ago`}
        </span>
      </div>

      <TheRead stats={stats} clusters={clusters} failed={failures >= 1 || statsFailed} />

      {/* ── 2. What can actually be traded, first ───────────────────────
          Reported: "the tradable and useful info coins arent shown first but
          before that worth noting coins some of which arent tradable". True —
          clusters opened the page at 685px and the tradable list sat at 1538px,
          so the first thing offered was a set of things most of which cannot be
          bought. Clusters are still the judgement only this product makes; they
          are just not what someone opens the app to do. */}
      {/* The one control surface for the whole page. */}
      <div className="mt-[3vh] flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-edge-strong">
        <div className="flex flex-wrap items-end gap-x-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={view === v.id}
              onClick={() => {
                setView(v.id)
                saveView(v.id)
              }}
              className={`-mb-px border-b-2 px-3 py-2 font-mono text-xs uppercase tracking-[0.1em] transition-colors ${
                view === v.id
                  ? "border-acid-500 text-acid-500"
                  : "border-transparent text-fg-dim hover:text-fg"
              }`}
            >
              {v.label}
              <span className="ml-2 text-micro text-fg-dim">
                {v.id === "trading"
                  ? marketsDown
                    ? "—"
                    : (traded?.length ?? "…")
                  : v.id === "new"
                    ? (tape?.length ?? "…")
                    : (clusters?.length ?? "…")}
              </span>
            </button>
          ))}
        </div>

        {view !== "clusters" && (
          <div className="flex flex-wrap items-center gap-3 pb-2">
            <Toggle on={hideRisky} onClick={() => setHideRisky((v) => !v)}>
              Hide likely spam
            </Toggle>
            <Toggle on={byRisk} onClick={() => setByRisk((v) => !v)}>
              {byRisk ? "Riskiest first" : "Newest first"}
            </Toggle>
            <FeedFilters value={filters} onChange={setFilters} />
          </div>
        )}
      </div>

      {measuredOnly && needsMeasurement(filters) && view !== "clusters" && (
        /* Said out loud, because a holder filter silently drops every token we
           have not measured yet — and four results could mean "only four are
           this clean" or "we have only measured forty". */
        <p className="measure mt-3 text-micro leading-relaxed text-warn">
          Holder filters only match launches we have already measured. Everything else is hidden
          here — not because it failed, but because we have not looked at it yet.
        </p>
      )}

      <section className={view === "trading" ? "mt-4" : "hidden"}>
        <div>
          {/* The intel-outage branch comes FIRST, before the skeleton.
              `marketsDown` only covers a DexScreener failure. `traded` derives
              from `launches`, which is null while the intel API is down, so an
              intel outage fell through to the skeleton and pulsed forever — in
              the one section that was moved to the top of the page, while its
              three neighbours all explained themselves honestly. Measured still
              pulsing at 70 seconds. This is the guarantee fixcheck.mjs asserts;
              the section escaped it by being moved after that suite was written. */}
          {failures >= 1 && traded === null ? (
            <EmptyState>
              The intelligence API is not responding, so we cannot say what is trading. This page
              retries every 12 seconds.
            </EmptyState>
          ) : marketsDown ? (
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

      {/* Order: traded coins, then ALL coins, then clusters.
          The cluster grid used to sit between the two tables, which put the raw
          tape at y=1951 — a reader scanning for something to trade hit five
          rows, then a wall of cluster blocks, then had to keep going to reach
          the other thirty. Both tables are the same act of scanning and belong
          together; the clusters are the judgement only this product makes, and
          they still follow, where somebody who wants them will look. */}
      <section className={view === "new" ? "mt-4" : "hidden"}>


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
        {/* Below the tape, not above it.
            Five lines of mono explaining a scale sat between the controls and
            the first row — ~95px of instruction, on every visit, for a reader
            who mostly already knows. The scale still has to be stated
            somewhere: nowhere else says 40 is high, or that the toggle is
            stricter than the band it appears to name, and the RiskPill's own
            reading is announced only to assistive tech. It reads as a footnote
            to the table it describes, which is where a legend belongs. */}
        <p className="mt-3 font-mono text-micro leading-relaxed text-fg-dim">
          Spam risk runs 0–100: higher means the launch looks more machine-generated. Under 15 is
          clean, 40 and over is high. <span className="text-fg-muted">Hide likely spam</span> is
          stricter than that line — it removes anything above 25. It is not a price forecast.
        </p>
      </section>
      <section className={view === "clusters" ? "mt-4" : "hidden"}>
        <SectionHead
          title="Worth looking at"
          note={clusters ? `${clusters.length} listed` : "…"}
        />
        {/* Four lines of 14px prose cost ~110px of a scanning surface to
            explain a heading that already says it. What survives is the part a
            reader cannot infer — the ordering, and the limit of the claim. */}
        <p className="mt-2 text-micro leading-relaxed text-fg-dim">
          Ordered by how fast independent wallets are arriving. A statement about who is launching,
          not a prediction about price.
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
      <div className="mt-6 border-y border-edge py-4">
        {failed ? (
          <p className="text-sm leading-relaxed text-warn">
            The index is not answering, so there is nothing measured to report here. This page
            retries every 12 seconds.
          </p>
        ) : (
          <Skeleton h={40} />
        )}
      </div>
    )
  }

  /* The same four measurements, as a strip rather than a paragraph.
     As prose this ran to four lines of 1.4rem type and pushed every row below
     the fold — 94% of the first viewport was text on a page whose whole claim
     is that it shows you a live tape. The figures are what carry the reading;
     the sentence around them was costing a screenful to say what the labels
     say. Nothing measured has been dropped. */
  /* Every figure is validated before it is shown. A field that arrives as
     something other than a finite number is not a measurement, and printing it
     anyway rendered a literal "[object Object]%" as though it were one — on the
     surface whose entire claim is that its numbers are real. A dash says "we do
     not have this" and is the only honest thing to draw. */
  const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)
  const count = (v: unknown) => (n(v) === null ? "—" : n(v)!.toLocaleString("en-US"))
  const pct = (v: unknown) => (n(v) === null ? "—" : `${n(v)}%`)

  const cells: { v: string; l: string; tone?: "warn" }[] = [
    { v: count(stats.launchesLastHour), l: "launched this hour" },
    {
      v: pct(stats.duplicatePct),
      l: "copy or impersonation",
      tone: (n(stats.duplicatePct) ?? 0) > 30 ? "warn" : undefined,
    },
    {
      v: pct(stats.highRiskPct),
      l: "score as noise",
      tone: (n(stats.highRiskPct) ?? 0) > 10 ? "warn" : undefined,
    },
    { v: count(stats.distinctCreators24h), l: "creators, 24h" },
  ]

  return (
    /* One line, not a stat grid.
       Stacked figure-over-label this ran to 79px of a first screen whose job is
       to show a tape. Set on a single baseline the same four measurements read
       as an instrument's status strip, which is what they are — and the row it
       gives back is a row of launches. */
    <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-y border-edge py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-7 gap-y-2">
        {cells.map((c) => (
          <span key={c.l} className="flex items-baseline gap-x-2">
            <span className={`font-mono text-sm font-medium tabular-nums ${c.tone === "warn" ? "text-warn" : "text-fg"}`}>
              {c.v}
            </span>
            <span className="font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
              {c.l}
            </span>
          </span>
        ))}
      </div>
      {/* Three states. `clusters == null` means the request failed or is in
          flight, and collapsing that into "no clusters" printed a finding about
          the chain that was really a network error. */}
      {clusters !== null && clusters.length === 0 && (
        <p className="flex-none text-xs text-fg-dim">
          No cluster right now has independent wallets launching into it.
        </p>
      )}
    </div>
  )
}

/* Straight to a coin.
 *
 * Reaching one took four steps — site, feed, a cluster, then its launch list —
 * and someone arriving with a ticker a friend sent them had no way in at all.
 * An address goes directly to its page; anything else queries the index rather
 * than filtering the thirty rows the browser happens to be holding. */
function Search() {
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<Launch[] | null>(null)
  const [busy, setBusy] = useState(false)
  /* A failed request is not an empty result. Collapsing the two rendered
     "Nothing in the index matches that" — a claim about the chain — whenever the
     network hiccuped or the API 500'd. Same class of bug the market layer
     already guards with its `ok` flag. */
  const [failed, setFailed] = useState(false)
  const navigate = useNavigate()
  const seq = useRef(0)

  useEffect(() => {
    const term = q.trim()
    const n = ++seq.current
    if (term.length < 2) {
      setHits(null)
      setFailed(false)
      setBusy(false)
      return
    }
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const r = await getJSON<{ items: Launch[] }>(`/intel/feed?limit=8&q=${encodeURIComponent(term)}`)
        if (seq.current === n) {
          setHits(Array.isArray(r.items) ? r.items : [])
          setFailed(false)
        }
      } catch {
        if (seq.current === n) {
          setHits(null)
          setFailed(true)
        }
      } finally {
        if (seq.current === n) setBusy(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const go = (e: React.FormEvent) => {
    e.preventDefault()
    const term = q.trim()
    // A whole address is unambiguous: skip the results and open it.
    if (/^0x[a-fA-F0-9]{40}$/.test(term)) navigate(`/app/token/${term.toLowerCase()}`)
    else if (hits?.length) navigate(`/app/token/${hits[0].address}`)
  }

  const open = q.trim().length >= 2

  return (
    <form onSubmit={go} role="search" className="relative">
      <label htmlFor="feed-search" className="sr-only">
        Find a token by ticker, name or address
      </label>
      {/* Combobox semantics, because this is one.
       *
       * A plain text input with a div of links appearing under it is invisible
       * to a screen reader: results arrived, the count changed, the first hit
       * became what Enter would open, and none of that was announced. The
       * `aria-expanded`/`aria-controls` pair tells a reader a list is there and
       * the status line below counts it. Not a full ARIA 1.2 combobox with
       * `aria-activedescendant` — arrow-key traversal is not implemented, and
       * claiming it in the markup would be worse than not claiming it. */}
      <input
        id="feed-search"
        role="combobox"
        aria-expanded={open}
        aria-controls="feed-search-results"
        aria-autocomplete="list"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        /* Short enough to survive 375px. The long form — "Find a token —
           ticker, name, or paste an address" — clipped mid-word on a phone,
           which is worse than saying less: a truncated instruction reads as a
           layout fault. The full sentence still reaches assistive tech through
           the label above. */
        placeholder="Ticker, name, or address"
        autoComplete="off"
        spellCheck={false}
        /* 16px minimum, or iOS Safari zooms the viewport on focus. */
        className="w-full border border-edge bg-transparent px-3 py-1.5 font-mono text-base text-fg placeholder:text-fg-dim focus-visible:border-acid-500"
      />
      {/* Counted out loud. Announced on a delay by the browser's own polite
          queue, which is right for a field somebody is still typing into. */}
      <p className="sr-only" aria-live="polite">
        {!open
          ? ""
          : busy && !hits
            ? "Searching"
            : failed
              ? "The index did not answer"
              : hits && hits.length
                ? `${hits.length} match${hits.length === 1 ? "" : "es"}, first is ${hits[0].symbol || hits[0].name}`
                : "No matches"}
      </p>
      {open && (
        <div
          id="feed-search-results"
          className="absolute inset-x-0 top-full z-30 border-x border-b border-edge bg-ink-950"
        >
          {busy && !hits ? (
            <p className="px-4 py-3 font-mono text-xs text-fg-dim">Searching the index…</p>
          ) : hits && hits.length ? (
            hits.map((l) => (
              <Link
                key={l.address}
                to={`/app/token/${l.address}`}
                onClick={() => setQ("")}
                className="scan-row flex items-baseline gap-x-4 border-t border-edge px-4 py-2.5 first:border-t-0"
              >
                <span className="font-mono text-sm font-semibold text-fg">{l.symbol || "—"}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-fg-dim">{l.name}</span>
                <span className="font-mono text-micro text-fg-dim">{ago(l.ageSeconds)}</span>
              </Link>
            ))
          ) : failed ? (
            <p className="px-4 py-3 text-xs text-warn">
              The index did not answer. This is a lookup failure on our side, not a statement about
              what exists — try again in a moment.
            </p>
          ) : (
            <p className="px-4 py-3 text-xs text-fg-dim">
              Nothing in the index matches that. It may have launched before indexing began.
            </p>
          )}
        </div>
      )}
    </form>
  )
}

