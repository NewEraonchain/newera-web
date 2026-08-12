import { useEffect, useRef, useState } from "react"

/* Filters that select from the index, not from the page — and only filters
 * that actually do something.
 *
 * WHAT WAS WRONG. This panel offered five groups. Measured against the live API
 * on 2026-08-12, against an unfiltered total of 2,254 rows:
 *
 *   Spam risk      2,254 → 1,213   works
 *   Age            2,254 → 2,254   IGNORED
 *   Holders        2,254 → 2,254   IGNORED
 *   Concentration  2,254 → 2,254   IGNORED
 *   The deployer   2,254 → 2,254   IGNORED
 *
 * Four of five did nothing. Fastify validates the querystring with
 * `removeAdditional`, so a parameter the schema does not declare is stripped in
 * silence — the request succeeded, the panel showed the filter as active, and
 * the reader was looking at an unfiltered feed believing it was narrowed. That
 * is worse than a missing feature: it is a wrong answer delivered confidently.
 *
 * The three distribution filters depended on a `TokenDistribution` table that
 * was reverted after it took production down, so they cannot work until it
 * ships again. They are removed rather than left visible and inert, and they
 * come back with the table.
 *
 * Age is now implemented server-side, and the three market filters below were
 * already implemented and simply never exposed.
 *
 * STRUCTURE. Every row is the same shape — a label, one line saying what the
 * number means, then a single row of mutually exclusive chips. No row mixes two
 * kinds of control, which is what made the old "The deployer" row read as
 * disorganised: it held two range chips and an unrelated on/off toggle side by
 * side, looking identical and behaving differently. Rows are grouped under two
 * headings because "what is the market doing" and "what is this launch" are
 * different questions, and a flat list of seven controls makes the reader sort
 * them out themselves.
 */

export type Filters = {
  maxRisk: number | null
  maxAgeMinutes: number | null
  minLiquidity: number | null
  minVolume: number | null
  minMcap: number | null
}

export const EMPTY: Filters = {
  maxRisk: null,
  maxAgeMinutes: null,
  minLiquidity: null,
  minVolume: null,
  minMcap: null,
}

const KEY = "newera_feed_filters"

/* Survives a reload, because a filter set is a workspace and rebuilding it
   every visit is the reason nobody uses filters twice. Read defensively: a
   shape written by an older build must not throw on the way in, and the older
   build wrote keys that no longer exist. */
export function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const p = JSON.parse(raw) as Partial<Filters>
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
    return {
      maxRisk: num(p.maxRisk),
      maxAgeMinutes: num(p.maxAgeMinutes),
      minLiquidity: num(p.minLiquidity),
      minVolume: num(p.minVolume),
      minMcap: num(p.minMcap),
    }
  } catch {
    return EMPTY
  }
}

export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams()
  if (f.maxRisk !== null) p.set("maxRisk", String(f.maxRisk))
  if (f.maxAgeMinutes !== null) p.set("maxAgeMinutes", String(f.maxAgeMinutes))
  if (f.minLiquidity !== null) p.set("minLiquidity", String(f.minLiquidity))
  if (f.minVolume !== null) p.set("minVolume", String(f.minVolume))
  if (f.minMcap !== null) p.set("minMcap", String(f.minMcap))
  const s = p.toString()
  return s ? `&${s}` : ""
}

export const activeCount = (f: Filters) =>
  Object.values(f).filter((v) => v !== null).length

/* Nothing here needs a distribution read any more, so nothing can be hidden by
   one. Kept exported because the feed still asks, and answering "no" honestly
   is better than the caller guessing. */
export const needsMeasurement = (_f: Filters) => false

/** One row of mutually exclusive choices. Clicking the active one clears it. */
function Row({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string
  hint: string
  options: { label: string; value: number }[]
  value: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <div className="grid gap-x-8 gap-y-2 border-t border-edge py-3.5 md:grid-cols-[13rem_1fr] md:items-baseline">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-fg">{label}</div>
        {/* Written out, not a tooltip. These thresholds are the product's
            judgement and a reader deserves the reasoning without a hover they
            may not be able to perform. */}
        <div className="mt-0.5 text-micro leading-relaxed text-fg-dim">{hint}</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : o.value)}
              className={`chip border px-2.5 py-1 font-mono text-micro tabular-nums ${
                on
                  ? "border-acid-500 text-acid-500"
                  : "border-edge text-fg-dim hover:border-edge-strong hover:text-fg"
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      <h3 className="font-mono text-micro uppercase tracking-[0.14em] text-fg-muted">{title}</h3>
      <div className="mt-1">{children}</div>
    </div>
  )
}

export default function FeedFilters({
  value,
  onChange,
}: {
  value: Filters
  onChange: (f: Filters) => void
}) {
  /* Closed on arrival, always.
     It used to open itself whenever a filter was active, which was harmless
     while it sat in the page flow and pushed the table down. As an overlay it
     covers the tape on every visit for anyone who ever set a filter — and the
     button already says how many are on, so opening it tells the reader
     nothing they cannot see. */
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(value))
    } catch {
      /* private mode, or storage full — the filters still work for this visit */
    }
  }, [value])

  /* An overlay has to be dismissable without hunting for the button that opened
     it. Escape and a click outside are what everything else on the web does,
     and a panel covering the table with neither is a trap. */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onDown)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onDown)
    }
  }, [open])

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...value, [k]: v })
  const n = activeCount(value)

  return (
    <div ref={root} className="relative">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`chip border px-3 py-1.5 font-mono text-micro uppercase tracking-[0.1em] ${
            n > 0
              ? "border-acid-500 text-acid-500"
              : "border-edge-strong text-fg-muted hover:text-fg"
          }`}
        >
          Filters{n > 0 ? ` · ${n}` : ""}
        </button>
        {n > 0 && (
          <button
            type="button"
            onClick={() => onChange(EMPTY)}
            className="px-1 py-1.5 font-mono text-micro uppercase tracking-[0.1em] text-fg-dim transition-colors hover:text-fg"
          >
            Clear
          </button>
        )}
      </div>

      {/* Absolutely positioned, because in flow it wrecks the control bar.
          This panel sits inside a flex row alongside the sort chips and the
          spam toggle; opening it grew the row's height, the row wrapped, and
          "Hide likely spam" was flung to its own line at the far left while the
          panel pushed the table down. A disclosure should not move the controls
          next to it. `right-0` because the button sits at the right edge, so
          the panel opens inward instead of off-screen. */}
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-[min(44rem,92vw)] border border-edge-strong bg-ink-850 p-5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9)]">
          <Group title="Market">
            <Row
              label="Liquidity"
              hint="How much you could sell into. Below a few thousand dollars, your own trade moves the price."
              value={value.minLiquidity}
              onChange={(v) => set("minLiquidity", v)}
              options={[
                { label: "$1k+", value: 1000 },
                { label: "$5k+", value: 5000 },
                { label: "$25k+", value: 25000 },
                { label: "$100k+", value: 100000 },
              ]}
            />
            <Row
              label="Volume 24h"
              hint="Traded in the last day. Separates a token with a market from one with a pool."
              value={value.minVolume}
              onChange={(v) => set("minVolume", v)}
              options={[
                { label: "$1k+", value: 1000 },
                { label: "$10k+", value: 10000 },
                { label: "$100k+", value: 100000 },
              ]}
            />
            <Row
              label="Market cap"
              hint="Price times supply, as the venue reports it. Not a valuation."
              value={value.minMcap}
              onChange={(v) => set("minMcap", v)}
              options={[
                { label: "$10k+", value: 10000 },
                { label: "$50k+", value: 50000 },
                { label: "$250k+", value: 250000 },
              ]}
            />
          </Group>

          <Group title="Launch">
            <Row
              label="Age"
              hint="Time since the token was minted. Most launches are dead within the hour."
              value={value.maxAgeMinutes}
              onChange={(v) => set("maxAgeMinutes", v)}
              options={[
                { label: "5m", value: 5 },
                { label: "1h", value: 60 },
                { label: "6h", value: 360 },
                { label: "24h", value: 1440 },
              ]}
            />
            <Row
              label="Spam risk"
              hint="How much the launch resembles machine-generated noise. Not a price forecast."
              value={value.maxRisk}
              onChange={(v) => set("maxRisk", v)}
              options={[
                { label: "under 15", value: 14 },
                { label: "under 25", value: 25 },
                { label: "under 40", value: 39 },
              ]}
            />
          </Group>

          {/* Named, not silently absent. Someone who used the holder filters
              yesterday will look for them, and "removed because it was lying to
              you" is the only honest thing to say. */}
          <p className="measure mt-5 border-t border-edge pt-4 text-micro leading-relaxed text-fg-dim">
            Holder, concentration and deployer filters are temporarily gone. They were sending
            parameters the API silently discarded, so they showed as active while changing nothing.
            They return with the distribution index.
          </p>
        </div>
      )}
    </div>
  )
}
