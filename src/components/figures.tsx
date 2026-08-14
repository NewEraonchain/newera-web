import { useEffect, useMemo, useRef, useState } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { getJSON, type Launch, type Separation, type Theme } from "@/lib/api"

gsap.registerPlugin(ScrollTrigger)

/* Figures drawn from live data.
 *
 * The site had a world, a typeface and motion, and almost no elements: nearly
 * every section was a heading, a paragraph and a ruled list. For a product
 * whose entire value is data, describing the data instead of drawing it is the
 * failure. These are the drawings.
 *
 * Authored SVG rather than a chart library. A charting default brings its own
 * grid, its own tooltip and its own idea of what a data point looks like, and
 * every one of those fights the world. Hairlines, mono labels, colour as
 * signal — the same vocabulary as everything else.
 *
 * Every figure fetches its own live data and renders nothing if the API is
 * unreachable, so a dead endpoint costs a section rather than the page. */

const still = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/* ── The judgement, as a matrix ────────────────────────────────────────────
   Launches against distinct creators, every live cluster counted into a cell.
   The whole product is the claim that those two numbers are not the same
   thing: the left-hand column is one wallet talking to itself, and everything
   right of it is independent wallets launching into the same idea.

   A scatter was the obvious choice and it was wrong. Creator counts top out
   around six and most clusters sit at two to six launches, so the points
   collapsed into one corner and left four-fifths of the field empty. Discrete,
   tightly-bounded data wants a matrix; the emptiness was the chart type
   failing, not the data being thin. */
export function ClusterField() {
  const [themes, setThemes] = useState<Theme[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [hover, setHover] = useState<{ c: number; row: number; n: number } | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    /* 100, because that is what the endpoint allows. It asked for 120 and got
       `400 querystring/limit must be <= 100` on every load, so this figure —
       the drawn version of the claim in the paragraph above it — has been
       absent from the landing page entirely, logging to a console nobody
       reads. The audit that finally caught it looks for console errors, which
       is the only trace a silent `return null` leaves. */
    getJSON<{ items: Theme[] }>("/intel/themes?limit=100")
      .then((r) => {
        if (!alive) return
        if (r.items?.length) setThemes(r.items)
        else setFailed(true)
      })
      .catch((e) => {
        console.error("[ClusterField]", e)
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const ROWS: { label: string; test: (n: number) => boolean }[] = [
    { label: "12+", test: (n) => n >= 12 },
    { label: "8–11", test: (n) => n >= 8 && n < 12 },
    { label: "6–7", test: (n) => n >= 6 && n < 8 },
    { label: "5", test: (n) => n === 5 },
    { label: "4", test: (n) => n === 4 },
    { label: "3", test: (n) => n === 3 },
    { label: "2", test: (n) => n === 2 },
  ]

  const grid = useMemo(() => {
    if (!themes) return null
    const maxC = Math.min(6, Math.max(2, ...themes.map((t) => t.creatorCount)))
    const cells = ROWS.map(() => Array.from({ length: maxC }, () => 0))
    for (const t of themes) {
      const c = Math.min(maxC, Math.max(1, t.creatorCount)) - 1
      const r = ROWS.findIndex((row) => row.test(t.launchCount))
      if (r >= 0) cells[r][c]++
    }
    const max = Math.max(1, ...cells.flat())
    /* Counted from what is PLOTTED, not from what was fetched.
       `solo` summed the grid's first column while `shared` was
       `themes.length - solo` — a numerator restricted to the rows the chart has
       and a denominator that is the whole response. Every theme the rows do not
       cover (a single launch, which the index used to return in bulk) fell
       silently into "had independent wallets arrive". Measured at the time: the
       caption read 3 solo and 97 shared where the plotted truth was 79 and 21.
       A chart's own description of itself is the last thing that should be
       computed from a different set. */
    const plotted = cells.flat().reduce((a, b) => a + b, 0)
    const solo = cells.reduce((t, row) => t + row[0], 0)
    return { cells, maxC, max, plotted, solo, shared: plotted - solo }
  }, [themes])

  useEffect(() => {
    const el = root.current
    if (!el || !grid || still()) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-cell]",
        { scale: 0, transformOrigin: "center" },
        {
          scale: 1,
          duration: 0.5,
          ease: "expo.out",
          stagger: { each: 0.012, from: "start" },
          immediateRender: false,
          scrollTrigger: { trigger: el, start: "top 82%", once: true },
        }
      )
    }, el)
    return () => ctx.revert()
  }, [grid])

  /* A failed read says so rather than leaving a gap where a figure was
     promised. Nothing here is a claim about the chain — which is the whole
     point of saying it out loud. */
  if (failed && !grid)
    return (
      <p className="measure text-sm leading-relaxed text-fg-dim">
        This figure is drawn from the live index, which is not answering right now. That is a
        lookup failure on our side, not a statement about what is launching.
      </p>
    )
  if (!themes || !grid) return null

  return (
    <figure ref={root} className="m-0">
      {/* The cells are presentational. They used to be 28 buttons with no click
          handler — a fake affordance, and 21 empty focus stops in front of a
          keyboard user. The figure states its own finding instead. */}
      <figcaption className="sr-only">
        {`${grid.plotted} live clusters plotted by launch count against distinct creators. ${grid.solo} come from a single wallet; ${grid.shared} had independent wallets launch into them.`}
      </figcaption>
      <div className="flex items-start justify-between gap-8">
        <span className="font-mono text-xs text-fg-dim">
          launches ↑ / distinct creators →
        </span>
        <span className="text-right font-mono text-micro">
          {hover && hover.n > 0 ? (
            <span className={hover.c === 1 ? "text-danger" : "text-acid-500"}>
              {hover.n} {hover.n === 1 ? "cluster" : "clusters"} · {ROWS[hover.row].label} launches
              from {hover.c} {hover.c === 1 ? "wallet" : "wallets"}
              {hover.c === 1 ? " · one wallet repeating" : ""}
            </span>
          ) : (
            <span className="text-fg-dim">{themes.length} live clusters</span>
          )}
        </span>
      </div>

      <div className="mt-6 flex gap-3">
        <div className="flex flex-col justify-between py-1 font-mono text-micro text-fg-dim">
          {ROWS.map((r) => (
            <span key={r.label} className="flex h-12 items-center">{r.label}</span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          {grid.cells.map((row, ri) => (
            <div key={ri} className="flex gap-1.5">
              {row.map((n, ci) => {
                const solo = ci === 0
                const weight = n / grid.max
                return (
                  <div
                    key={ci}
                    data-cell
                    aria-hidden
                    onMouseEnter={() => setHover({ c: ci + 1, row: ri, n })}
                    onMouseLeave={() => setHover(null)}
                    className="mb-1.5 flex h-12 flex-1 items-center justify-center border transition-colors"
                    style={{
                      borderColor: n ? "transparent" : "rgba(255,255,255,.07)",
                      background: n
                        ? solo
                          ? `rgba(255,107,122,${0.12 + weight * 0.62})`
                          : `rgba(205,255,77,${0.1 + weight * 0.62})`
                        : "transparent",
                    }}
                  >
                    {n > 0 && (
                      <span
                        className={`font-mono text-xs font-semibold ${
                          weight > 0.45 ? "text-ink-950" : solo ? "text-danger" : "text-acid-500"
                        }`}
                      >
                        {n}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          <div className="mt-1 flex gap-1.5 font-mono text-micro text-fg-dim">
            {Array.from({ length: grid.maxC }, (_, i) => (
              <span key={i} className="flex-1 text-center">
                {i + 1}
                {i === grid.maxC - 1 ? "+" : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="measure mt-7 text-sm leading-relaxed text-fg-muted">
        Everything in the first column is one wallet launching into its own idea. Everything right
        of it had independent wallets arrive. Same launch counts, opposite meanings — which is the
        distinction a chart of price cannot draw, because none of these have traded.
      </p>
    </figure>
  )
}

/* ── Where the score actually lands ────────────────────────────────────────
   The risk score is the product's most contestable claim, so the honest thing
   is to show its whole distribution rather than quote one percentage.

   And to show the two populations rather than assert the ratio between them.
   The separation used to be a hardcoded "4.2x" — one hand-run of an admin
   backtest, transcribed into JSX, never re-derived, and by the time anyone read
   it nobody could say whether it was still true. It is now measured at render
   time, and when the sample is too thin to mean anything the block renders
   nothing rather than a number. */
/**
 * The measured risk separation, or null if it cannot be had — an API without
 * the endpoint, a sample too thin to be conclusive, and a network failure are
 * all the same answer to the page: we do not know, so do not say.
 *
 * A hook rather than a component because the two places that show this draw it
 * differently — bars beside the distribution here, two figures side by side on
 * /detection — and sharing a layout to share a fetch would force one of them
 * into the wrong shape.
 */
export function useSeparation(): Separation | null {
  const [sep, setSep] = useState<Separation | null>(null)
  useEffect(() => {
    let alive = true
    getJSON<Separation>("/intel/separation")
      .then((r) => {
        if (!alive) return
        const ok =
          r?.conclusive &&
          r.lift != null &&
          r.lowRisk?.survivalPct != null &&
          r.highRisk?.survivalPct != null
        setSep(ok ? r : null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return sep
}

/* THE VALIDATION, PUBLISHED.
 *
 * Every band of the score against how often those launches were still being
 * traded at the checkpoint, with n on every row, recomputed from the outcome
 * table rather than quoted from a run somebody did once.
 *
 * A competitor can copy a feature in a sprint. Publishing numbers that might
 * embarrass you is a different kind of commitment — and it makes this the only
 * claim on the site a reader can check instead of accept. It follows that the
 * page must be willing to show a bad number: nothing here filters for a
 * flattering answer, and a band below the sample floor reports "too few" rather
 * than a percentage that would read as a finding. */
export type Scorecard = {
  checkpoint: number
  measuredAt: string
  total: number
  bands: {
    band: string
    label: string
    detail: string
    n: number
    survived: number
    survivalPct: number | null
  }[]
  lift: number | null
  survivalMeans: string
  caveat: string
}

export function useScorecard(): Scorecard | null | "failed" {
  const [card, setCard] = useState<Scorecard | null | "failed">(null)
  useEffect(() => {
    let alive = true
    getJSON<Scorecard>("/intel/scorecard")
      .then((r) => alive && setCard(r))
      .catch(() => alive && setCard("failed"))
    return () => {
      alive = false
    }
  }, [])
  return card
}

export function Scorecard() {
  const card = useScorecard()

  if (card === "failed")
    return (
      <p className="text-sm leading-relaxed text-warn">
        The scorecard is not available right now — this page draws it live from{" "}
        <span className="font-mono text-xs">/intel/scorecard</span>, and rather than show a figure
        from an earlier run it shows nothing.
      </p>
    )
  if (!card) return <div className="h-24" aria-hidden />

  const widest = Math.max(1, ...card.bands.map((b) => b.n))

  return (
    <div>
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Spam-risk band against how often those launches were still trading at the{" "}
          {card.checkpoint}-minute checkpoint
        </caption>
        <thead>
          <tr className="border-b border-edge-strong">
            {["Band", "Still trading", "Launches"].map((h, i) => (
              <th
                key={h}
                scope="col"
                className={`py-2 font-mono text-micro font-normal uppercase tracking-[0.1em] text-fg-dim ${
                  i === 0 ? "text-left" : "text-right"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {card.bands.map((b) => (
            <tr key={b.band} className="border-b border-edge align-baseline">
              <td className="py-3 pr-4">
                <div className="text-sm text-fg">{b.label}</div>
                <div className="measure mt-0.5 text-micro leading-relaxed text-fg-dim">
                  {b.detail}
                </div>
              </td>
              <td className="py-3 text-right">
                {b.survivalPct === null ? (
                  <span className="font-mono text-sm text-fg-dim">too few</span>
                ) : (
                  <span
                    className={`font-display text-2xl font-bold leading-none ${
                      b.band === "clean"
                        ? "text-acid-500"
                        : b.band === "high"
                          ? "text-danger"
                          : "text-fg"
                    }`}
                  >
                    {b.survivalPct.toFixed(1)}%
                  </span>
                )}
              </td>
              <td className="py-3 text-right font-mono text-micro tabular-nums text-fg-dim">
                {/* The bar is the sample size, not the result. A band measured
                    on nine launches and one measured on nine hundred should not
                    look equally solid. */}
                <div className="flex items-center justify-end gap-2">
                  <span
                    aria-hidden="true"
                    className="block h-[3px] bg-[rgba(255,255,255,.18)]"
                    style={{ width: `${Math.max(4, (b.n / widest) * 64)}px` }}
                  />
                  n={b.n.toLocaleString("en-US")}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {card.lift && (
        <p className="mt-4 text-base leading-relaxed text-fg-muted">
          A clean launch was <b className="text-fg">{card.lift.toFixed(1)}×</b> more likely to still
          be trading than a high-risk one, from information available at block zero — no price, no
          chart, no holders.
        </p>
      )}
      <p className="measure mt-3 font-mono text-micro leading-relaxed text-fg-dim">
        {card.survivalMeans} {card.caveat} Measured over{" "}
        {card.total.toLocaleString("en-US")} launches at the {card.checkpoint}-minute checkpoint,{" "}
        {new Date(card.measuredAt).toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}
        . Drawn live from <span className="text-fg-muted">/intel/scorecard</span>, which is public.
      </p>
    </div>
  )
}

export function RiskHistogram() {
  const [items, setItems] = useState<Launch[] | null>(null)
  const sep = useSeparation()
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    getJSON<{ items: Launch[] }>("/intel/feed?limit=200")
      .then((r) => alive && r.items?.length && setItems(r.items))
      .catch((e) => console.error("[RiskHistogram]", e))
    return () => {
      alive = false
    }
  }, [])

  const buckets = useMemo(() => {
    if (!items) return null
    const b = Array.from({ length: 20 }, () => 0)
    for (const l of items) b[Math.min(19, Math.floor(l.riskScore / 5))]++
    return b
  }, [items])

  useEffect(() => {
    const el = root.current
    if (!el || !buckets || still()) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-bar]",
        { scaleY: 0 },
        {
          scaleY: 1,
          duration: 0.9,
          ease: "expo.out",
          stagger: 0.02,
          immediateRender: false,
          scrollTrigger: { trigger: el, start: "top 82%", once: true },
        }
      )
    }, el)
    return () => ctx.revert()
  }, [buckets])

  if (!buckets || !items) return null
  const max = Math.max(...buckets)

  return (
    <div ref={root}>
      {sep && (
        <div className="mb-12">
          <h3 className="font-mono text-micro uppercase tracking-[0.14em] text-fg-dim">
            Survival at {sep.checkpoint} minutes
          </h3>
          <dl className="mt-4">
            <Population
              label="Scored under 15"
              n={sep.lowRisk!.n}
              pct={sep.lowRisk!.survivalPct!}
              tone="acid"
            />
            <Population
              label="Scored 40 or over"
              n={sep.highRisk!.n}
              pct={sep.highRisk!.survivalPct!}
              tone="danger"
            />
          </dl>
          {/* The ratio is the consequence of the two bars above it, not a claim
              standing on its own — so it is stated after them, at their scale. */}
          <p className="mt-5 flex flex-wrap items-baseline gap-x-3 border-t border-edge pt-4">
            <span className="font-display text-3xl font-bold text-fg" style={{ fontStretch: "82%" }}>
              {sep.lift!.toFixed(2)}x
            </span>
            <span className="measure-tight text-sm text-fg-muted">
              more of the low-risk launches were still being traded, across{" "}
              {sep.sampleSize.toLocaleString("en-US")} measured launches.
            </span>
          </p>
          {sep.caveat && (
            <p className="measure mt-3 text-xs leading-relaxed text-fg-dim">{sep.caveat}</p>
          )}
        </div>
      )}

      <h3 className="mb-4 font-mono text-micro uppercase tracking-[0.14em] text-fg-dim">
        Where the score lands
      </h3>
      <div className="flex h-56 items-end gap-[3px]">
        {buckets.map((n, i) => {
          const risky = i * 5 >= 40
          return (
            <span
              key={i}
              data-bar
              title={`${n} launches scoring ${i * 5}–${i * 5 + 4}`}
              style={{ height: `${Math.max(2, (n / max) * 100)}%` }}
              className={`flex-1 origin-bottom ${risky ? "bg-danger/70" : "bg-acid-500/70"}`}
            />
          )
        })}
      </div>
      <div className="mt-3 flex justify-between border-t border-edge pt-2 font-mono text-micro text-fg-dim">
        <span>0 — clean</span>
        <span className="text-danger">40 — manufactured ↑</span>
        <span>100</span>
      </div>
      <p className="measure mt-4 text-xs leading-relaxed text-fg-dim">
        {items.length} launches from the live index. The threshold is not a prediction; it is where
        a launch stops resembling a person and starts resembling a script.
      </p>
    </div>
  )
}

/* One of the two groups, drawn to the same scale so the comparison is made by
   the eye rather than by arithmetic. The bar is the survival rate; the count
   sits beside it, because a rate without its n is not a measurement. */
function Population({
  label,
  n,
  pct,
  tone,
}: {
  label: string
  n: number
  pct: number
  tone: "acid" | "danger"
}) {
  return (
    <div className="border-b border-edge py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <dt className="text-sm font-semibold text-fg">{label}</dt>
        <dd className="flex items-baseline gap-3 font-mono text-micro text-fg-dim">
          <span className={tone === "acid" ? "text-acid-500" : "text-danger"}>
            {pct.toFixed(1)}% still traded
          </span>
          <span>n={n.toLocaleString("en-US")}</span>
        </dd>
      </div>
      <div className="mt-2.5 h-1.5 bg-ink-800">
        <div
          data-bar-h
          style={{ width: `${Math.max(0.5, pct)}%` }}
          className={`h-full origin-left ${tone === "acid" ? "bg-acid-500" : "bg-danger"}`}
        />
      </div>
    </div>
  )
}

/* ── The rate, as a strip ──────────────────────────────────────────────────
   One bar per minute of the window the feed covers. It exists to make the
   volume physical: a number saying "nine thousand a day" is abstract, and a
   wall of minute bars is not. */
export function CadenceStrip() {
  const [items, setItems] = useState<Launch[] | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    const load = () =>
      getJSON<{ items: Launch[] }>("/intel/feed?limit=200")
        .then((r) => alive && r.items?.length && setItems(r.items))
        .catch(() => {})
    load()
    const t = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const bars = useMemo(() => {
    if (!items) return null
    const byMinute = new Map<number, number>()
    for (const l of items) {
      const m = Math.floor(l.ageSeconds / 60)
      byMinute.set(m, (byMinute.get(m) || 0) + 1)
    }
    const span = Math.max(...byMinute.keys())
    // Oldest on the left, newest on the right: time reads left to right.
    return Array.from({ length: span + 1 }, (_, i) => byMinute.get(span - i) || 0)
  }, [items])

  useEffect(() => {
    const el = root.current
    if (!el || !bars || still()) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-tick]",
        { scaleY: 0 },
        {
          scaleY: 1,
          duration: 0.6,
          ease: "expo.out",
          stagger: 0.012,
          immediateRender: false,
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        }
      )
    }, el)
    return () => ctx.revert()
  }, [bars])

  if (!bars) return null
  const max = Math.max(...bars)

  return (
    <div ref={root}>
      {/* The GAPS were the overflow, not the bars.
          Each bar is `flex-1` with a zero basis and can shrink to nothing, but
          `gap-px` is fixed: at one minute per bar this row carries ~260 of
          them, so 259 gaps put a hard 259px floor under a 320px viewport and
          the whole page scrolled sideways. Below `sm` the bars are about a
          pixel wide anyway — no gap can separate them at that size — so the
          separator is spent where it can actually be seen. */}
      <div className="flex h-20 min-w-0 items-end gap-0 sm:gap-px">
        {bars.map((n, i) => (
          <span
            key={i}
            data-tick
            style={{ height: `${Math.max(3, (n / max) * 100)}%` }}
            className="flex-1 origin-bottom bg-fg/25 last:bg-acid-500"
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-micro text-fg-dim">
        <span>{bars.length} min ago</span>
        {/* "newest indexed", not "now". Ingest runs nine to ten minutes behind
            the chain head, which is exactly why the right-hand bars thin out —
            labelling that edge "now" would present the lag as live. */}
        <span className="text-acid-500">newest indexed</span>
      </div>
    </div>
  )
}
