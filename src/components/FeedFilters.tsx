import { useEffect, useState } from "react"

/* Filters that select from the index, not from the page.
 *
 * The feed had two toggles against a competitor's twenty. The distinction that
 * matters is not the count though — it is WHERE the filter runs. Narrowing the
 * thirty rows the browser already holds is a sort with extra steps: ask for
 * "over 50 holders" and you get however many of those thirty qualify, which is
 * usually none, and the reader concludes the chain is empty. These go to the
 * database as query parameters and select from everything indexed.
 *
 * Deliberately few. Every filter here answers a question somebody actually
 * asks — can I get out, is the deployer still holding, is it fresh — and a
 * control nobody understands is worse than one that does not exist. */

export type Filters = {
  maxRisk: number | null
  minHolders: number | null
  maxTop10: number | null
  maxDevHolds: number | null
  noDevSold: boolean
  maxAgeMinutes: number | null
}

export const EMPTY: Filters = {
  maxRisk: null,
  minHolders: null,
  maxTop10: null,
  maxDevHolds: null,
  noDevSold: false,
  maxAgeMinutes: null,
}

const KEY = "newera_feed_filters"

/* Survives a reload, because a filter set is a workspace and rebuilding it
   every visit is the reason nobody uses filters twice. Read defensively: a
   shape written by an older build must not throw on the way in. */
export function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const p = JSON.parse(raw) as Partial<Filters>
    return {
      maxRisk: typeof p.maxRisk === "number" ? p.maxRisk : null,
      minHolders: typeof p.minHolders === "number" ? p.minHolders : null,
      maxTop10: typeof p.maxTop10 === "number" ? p.maxTop10 : null,
      maxDevHolds: typeof p.maxDevHolds === "number" ? p.maxDevHolds : null,
      noDevSold: p.noDevSold === true,
      maxAgeMinutes: typeof p.maxAgeMinutes === "number" ? p.maxAgeMinutes : null,
    }
  } catch {
    return EMPTY
  }
}

export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams()
  if (f.maxRisk !== null) p.set("maxRisk", String(f.maxRisk))
  if (f.minHolders !== null) p.set("minHolders", String(f.minHolders))
  if (f.maxTop10 !== null) p.set("maxTop10", String(f.maxTop10))
  if (f.maxDevHolds !== null) p.set("maxDevHolds", String(f.maxDevHolds))
  if (f.noDevSold) p.set("devSold", "false")
  if (f.maxAgeMinutes !== null) p.set("maxAgeMinutes", String(f.maxAgeMinutes))
  const s = p.toString()
  return s ? `&${s}` : ""
}

export const activeCount = (f: Filters) =>
  (f.maxRisk !== null ? 1 : 0) +
  (f.minHolders !== null ? 1 : 0) +
  (f.maxTop10 !== null ? 1 : 0) +
  (f.maxDevHolds !== null ? 1 : 0) +
  (f.noDevSold ? 1 : 0) +
  (f.maxAgeMinutes !== null ? 1 : 0)

/** Whether the set touches anything only measured tokens can satisfy. */
export const needsMeasurement = (f: Filters) =>
  f.minHolders !== null || f.maxTop10 !== null || f.maxDevHolds !== null || f.noDevSold

function Choice({
  label,
  on,
  onClick,
}: {
  label: string
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`border px-3 py-1.5 font-mono text-xs transition-colors ${
        on
          ? "border-acid-500 text-acid-500"
          : "border-edge text-fg-dim hover:border-edge-strong hover:text-fg"
      }`}
    >
      {label}
    </button>
  )
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="border-t border-edge py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span className="text-sm font-semibold text-fg">{label}</span>
        {/* Written out, not a tooltip. These thresholds are the product's
            judgement and a reader deserves to see the reasoning without a
            hover they may not be able to perform. */}
        <span className="measure-tight text-xs leading-relaxed text-fg-dim">{hint}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">{children}</div>
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
  const [open, setOpen] = useState(() => activeCount(loadFilters()) > 0)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(value))
    } catch {
      /* private mode, or storage full — the filters still work for this visit */
    }
  }, [value])

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...value, [k]: v })
  const toggle = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    set(k, (value[k] === v ? null : v) as Filters[K])

  const n = activeCount(value)

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`block-btn border ${
            n > 0 ? "border-acid-500 text-acid-500" : "border-edge-strong text-fg-muted hover:text-fg"
          }`}
        >
          Filters{n > 0 ? ` · ${n}` : ""}
        </button>
        {n > 0 && (
          <button
            type="button"
            onClick={() => onChange(EMPTY)}
            className="scan-link py-1.5 text-xs text-fg-dim"
          >
            Clear
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 border-b border-edge">
          <Row label="Age" hint="Most launches are dead within the hour.">
            {[
              ["5 minutes", 5],
              ["1 hour", 60],
              ["6 hours", 360],
              ["24 hours", 1440],
            ].map(([l, v]) => (
              <Choice
                key={String(v)}
                label={String(l)}
                on={value.maxAgeMinutes === v}
                onClick={() => toggle("maxAgeMinutes", v as number)}
              />
            ))}
          </Row>

          <Row
            label="Spam risk"
            hint="How much the launch resembles machine-generated noise. Not a price forecast."
          >
            {[
              ["under 15", 14],
              ["under 25", 25],
              ["under 40", 39],
            ].map(([l, v]) => (
              <Choice
                key={String(v)}
                label={String(l)}
                on={value.maxRisk === v}
                onClick={() => toggle("maxRisk", v as number)}
              />
            ))}
          </Row>

          <Row
            label="Holders"
            hint="Wallets holding, excluding the pool and the contract. Under five and there is nobody to sell to."
          >
            {[
              ["10+", 10],
              ["50+", 50],
              ["200+", 200],
            ].map(([l, v]) => (
              <Choice
                key={String(v)}
                label={String(l)}
                on={value.minHolders === v}
                onClick={() => toggle("minHolders", v as number)}
              />
            ))}
          </Row>

          <Row
            label="Concentration"
            hint="Share held by the largest ten wallets. Above 90% a handful of them can move the price alone."
          >
            {[
              ["under 50%", 50],
              ["under 70%", 70],
              ["under 90%", 90],
            ].map(([l, v]) => (
              <Choice
                key={String(v)}
                label={String(l)}
                on={value.maxTop10 === v}
                onClick={() => toggle("maxTop10", v as number)}
              />
            ))}
          </Row>

          <Row
            label="The deployer"
            hint="What the wallet that created the token still holds, and whether it has sold any."
          >
            {[
              ["holds under 5%", 5],
              ["holds under 20%", 20],
            ].map(([l, v]) => (
              <Choice
                key={String(v)}
                label={String(l)}
                on={value.maxDevHolds === v}
                onClick={() => toggle("maxDevHolds", v as number)}
              />
            ))}
            <Choice
              label="has not sold"
              on={value.noDevSold}
              onClick={() => set("noDevSold", !value.noDevSold)}
            />
          </Row>
        </div>
      )}
    </div>
  )
}
