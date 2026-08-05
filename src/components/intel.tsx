import { Link } from "react-router-dom"
import type { Theme, ThemeStatus } from "@/lib/api"
import { ago } from "@/lib/api"

/* The Operate surface, in the Aperture world.
 *
 * Same vocabulary as the rest of the site — rules instead of cards, mono for
 * data, colour as signal only — but no aperture and no display type. This is a
 * tape somebody reads at speed to make a decision, so density, scanability and
 * a stable row rhythm outrank expression. A cluster row that dims because the
 * pointer is elsewhere would be actively hostile here.
 *
 * Every card, pill and rounded container is gone. Cards inside cards were most
 * of what made this page read as a generic dashboard: a bordered box per
 * cluster, each holding bordered boxes per sample. */

/* Plain-language explanations. A flag nobody understands is just noise. */
export const FLAG_TEXT: Record<string, string> = {
  INVISIBLE_CHARS:
    "Contains invisible characters — the ticker renders identically to another token but is a different string",
  HOMOGLYPH: "Uses lookalike letters from another alphabet to imitate a real ticker",
  MIXED_SCRIPT: "Mixes alphabets in a way that is almost always deliberate imitation",
  NAME_COLLISION: "Near-identical name launched around the same time",
  SYMBOL_COLLISION: "Ticker already used by a recent launch",
}
export const FLAG_SHORT: Record<string, string> = {
  INVISIBLE_CHARS: "INVISIBLE",
  HOMOGLYPH: "LOOKALIKE",
  MIXED_SCRIPT: "MIXED",
  NAME_COLLISION: "COPY",
  SYMBOL_COLLISION: "DUPE",
}

export const EXPLORER = "https://robinhoodchain.blockscout.com"

const STATUS_TONE: Record<ThemeStatus, string> = {
  EMERGING: "text-acid-500",
  HOT: "text-warn",
  SATURATED: "text-fg-muted",
  DECAYING: "text-fg-dim",
}

export function StatusBadge({ status }: { status: ThemeStatus }) {
  return (
    <span
      className={`flex-none font-mono text-micro font-semibold uppercase tracking-[0.1em] ${STATUS_TONE[status]}`}
    >
      {status}
    </span>
  )
}

/* The tier a score falls in, in words. Colour encodes it too, but acid and warn
   measure ΔE 10.4 under deuteranopia — the two commonest tiers are effectively
   the same hue for a red-green colour-blind reader. The number itself carries
   the information, and this makes the threshold available to anyone who cannot
   hover: `title` on a non-focusable span is unreachable on touch and is not
   announced by NVDA or JAWS when the element already has text. */
const riskTier = (score: number) => (score >= 40 ? "high" : score >= 15 ? "medium" : "low")

export function RiskPill({ score }: { score: number }) {
  const tone = score >= 40 ? "text-danger" : score >= 15 ? "text-warn" : "text-acid-500"
  return (
    <span
      className={`min-w-[2.2rem] text-right font-mono text-sm font-semibold ${tone}`}
      aria-label={`Spam risk ${score} out of 100, ${riskTier(score)}`}
      title={`Spam risk ${score}/100 — how much this looks like machine-generated noise, not a price prediction`}
    >
      {score}
    </span>
  )
}

export function FlagPill({ flag }: { flag: string }) {
  return (
    <span
      className="font-mono text-micro font-semibold tracking-[0.06em] text-danger"
      /* The plain-language explanations in FLAG_TEXT existed only as a `title`,
         so the work of writing them reached mouse users and nobody else. */
      aria-label={FLAG_TEXT[flag] || flag}
      title={FLAG_TEXT[flag] || flag}
    >
      {FLAG_SHORT[flag] || flag}
    </span>
  )
}

/** One cluster, with its judgement written out.
 *
 * This row used to encode the finding three times over and state it none: a bar
 * chart of creators against launches, the same two counts again as figures, and
 * a status badge. The badge said EMERGING on every cluster on the site —
 * measured, 100 of 100 — so the loudest coloured element on the page carried no
 * information at the exact moment it was meant to. The bar said the same thing
 * as the numbers beside it, which is decoration wearing the costume of a chart.
 *
 * A reader needs one sentence: how many wallets, how many launches, how long.
 * That is the whole judgement, and in words it needs no legend. */
export function ClusterRow({ theme }: { theme: Theme }) {
  const wallets = theme.creatorCount
  const solo = wallets <= 1
  return (
    <Link
      to={`/app/theme/${theme.slug}`}
      viewTransition
      className="scan-row grid gap-x-6 gap-y-1.5 border-b border-edge py-5 pl-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline"
    >
      <span className="min-w-0">
        {/* The row and the page it opens are the same object, so the browser
            morphs one into the other instead of cutting. Only one element may
            carry a given name at a time, which holds because the row unmounts
            as the detail page mounts. */}
        <span
          style={{ viewTransitionName: `cluster-${theme.slug}` }}
          className="block truncate text-lg font-semibold text-fg"
        >
          {theme.label}
        </span>

        <span className="mt-1.5 block text-sm leading-relaxed text-fg-muted">
          {solo ? (
            <>
              <b className="font-semibold text-danger">One wallet</b> launched all{" "}
              {theme.launchCount} of these, over {ago(theme.ageMinutes * 60)}. That is a single
              address repeating itself, not a narrative.
            </>
          ) : (
            <>
              <b className="font-semibold text-acid-500">{wallets} independent wallets</b> launched{" "}
              {theme.launchCount} tokens into this over {ago(theme.ageMinutes * 60)}.
            </>
          )}
        </span>

        {/* Distinct tickers only. These clusters are built out of near-copies,
            so the raw samples are frequently the same string over and over —
            rows were reading "AI · AI · AI · AI". One ticker repeating is the
            finding, and it says more once. */}
        {(() => {
          // Array.isArray, not `|| []`. The truthiness guard passes a string
          // straight through to .map, and one drifted field here took the whole
          // document down before there was a boundary to catch it.
          const samples = Array.isArray(theme.samples) ? theme.samples : []
          const tickers = [...new Set(samples.map((s) => s?.symbol || s?.name))].filter(Boolean)
          if (!tickers.length) return null
          return (
            <span className="mt-2 block truncate font-mono text-xs text-fg-dim">
              {tickers.slice(0, 5).join("  ·  ")}
              {tickers.length === 1 && theme.launchCount > 1 && (
                <span className="ml-2 text-fg-dim/70">· every launch used this ticker</span>
              )}
            </span>
          )
        })()}
      </span>

      <span className="font-mono text-micro uppercase tracking-[0.12em] text-fg-dim sm:text-right">
        Open →
      </span>
    </Link>
  )
}

export function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`block-btn border ${
        on
          ? "border-acid-500 bg-acid-500 text-ink-950"
          : "border-edge-strong text-fg-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  )
}

/* A loading row you can actually see.
 *
 * This was `bg-white/[.02]`, which against point black composites to #030303 —
 * 1.02:1, and 1.04:1 at the top of the pulse. Only the hairline border was
 * visible, so "loading" was indistinguishable from "empty table", and the pulse
 * animated something nobody could perceive. .07 sits between `edge` and
 * `edge-strong` — the weakest fill in this world that still reads as a surface
 * rather than as a hairline box around nothing. */
export function Skeleton({ h = 48 }: { h?: number }) {
  return (
    <div
      className="animate-pulse border-b border-edge bg-[rgba(255,255,255,.07)]"
      style={{ height: h }}
      aria-hidden
    />
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l border-edge-strong py-8 pl-5 text-sm leading-relaxed text-fg-dim">
      {children}
    </div>
  )
}
