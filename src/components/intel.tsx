import { Link } from "react-router-dom"
import type { Launch, Theme, ThemeStatus } from "@/lib/api"
import { ago } from "@/lib/api"
import { usd, type Market } from "@/lib/markets"

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

/* One row of the live tape.
 *
 * It carries a second link now — the market handoff — and a link inside a link
 * is invalid HTML and unreachable by keyboard, so the row is a container with
 * two anchors rather than one anchor wrapping everything. */
export function LaunchRow({
  launch,
  market,
  marketStatus = "ok",
}: {
  launch: Launch
  market?: Market
  marketStatus?: "ok" | "loading" | "down"
}) {
  const risky = launch.riskScore >= 40
  return (
    <div className="scan-row relative border-b border-edge py-3 pl-3">
      <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-4">
        <span className="font-mono text-micro text-fg-dim">{ago(launch.ageSeconds)}</span>
        {/* Stays on the site. Every row used to open a block explorer in a new
            tab — the most natural action in the tape sent the reader away to a
            tool that cannot say what the index knows about the launch. */}
        <Link
          to={`/app/token/${launch.address}`}
          className="-my-1 flex min-w-0 flex-wrap items-baseline gap-x-3 py-1"
        >
          <span className="font-mono text-sm font-semibold text-fg">{launch.symbol || "—"}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-fg-dim">{launch.name}</span>
        </Link>
        <span className="flex flex-none items-baseline gap-3">
          {launch.devBuyEth > 0 && (
            <span
              className="font-mono text-micro text-fg-dim"
              // "Ξ" is never expanded anywhere in the UI, and the only thing
              // saying what this figure is was a hover.
              aria-label={`Creator staked ${launch.devBuyEth} ETH in their own launch`}
              title={`Creator committed ${launch.devBuyEth} ETH at launch`}
            >
              {launch.devBuyEth.toFixed(2)}Ξ
            </span>
          )}
          {(launch.spoofFlags || []).slice(0, 2).map((f) => (
            <FlagPill key={f} flag={f} />
          ))}
          {/* Only when no collision flag already says it. NAME_COLLISION shortens
              to "COPY", so rendering both printed COPY twice on the same row. */}
          {launch.dupeCount > 0 &&
            !(launch.spoofFlags || []).some(
              (f) => f === "NAME_COLLISION" || f === "SYMBOL_COLLISION"
            ) && <span className="font-mono text-micro font-semibold text-warn">COPY</span>}
          <RiskPill score={launch.riskScore} />
        </span>
      </div>

      <div className="mt-1.5 pl-[3.9rem]">
        <MarketLine market={market} status={marketStatus} />
      </div>

      {/* A high-risk row keeps a marker, but as a hairline in the gutter rather
          than a 2px coloured border on a card. */}
      {risky && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-px bg-danger/70" />
      )}
    </div>
  )
}

/* What the market says, or that there is not one.
 *
 * "No market yet" is not an empty state to be hidden — it is the product's
 * central claim about the token in front of you, and it is true of most of
 * them. Saying it plainly is what makes the rows that *do* have a market read
 * as significant. */
export function MarketLine({
  market,
  status = "ok",
  big,
}: {
  market?: Market
  /** "loading" while the lookup is in flight, "down" when it failed. */
  status?: "ok" | "loading" | "down"
  big?: boolean
}) {
  // Three states, not one. Saying "nobody can trade this" is a measurement,
  // and it must never be printed from a pending or failed lookup.
  if (status === "loading") return <span className="font-mono text-xs text-fg-dim">Checking for a market…</span>
  if (status === "down")
    return <span className="font-mono text-xs text-warn">Market data unavailable right now.</span>

  if (!market || !market.liquidityUsd) {
    return <span className="font-mono text-xs text-fg-dim">No market yet. Nobody can trade this.</span>
  }

  const chg = market.priceChange24h
  const tone = chg === null ? "text-fg-dim" : chg >= 0 ? "text-acid-500" : "text-danger"
  /* text-xs, not text-micro. 11px is the floor for a *label*; this is a
     sentence's worth of running data and reads as body text, which is what the
     detector's tiny-text rule catches — it caught sixteen of these. */
  const size = big ? "text-sm" : "text-xs"

  return (
    <span className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono ${size} text-fg-dim`}>
      <span>
        <span className="text-fg-muted">{usd(market.liquidityUsd)}</span> liquidity
      </span>
      <span>
        <span className="text-fg-muted">{usd(market.volume24h)}</span> traded 24h
      </span>
      {market.txns24h !== null && market.txns24h > 0 && (
        <span>
          <span className="text-fg-muted">{market.txns24h.toLocaleString("en-US")}</span> trades
        </span>
      )}
      {chg !== null && (
        <span className={tone}>
          {chg >= 0 ? "+" : ""}
          {chg.toFixed(chg >= 100 || chg <= -100 ? 0 : 1)}% 24h
        </span>
      )}
      {market.url && (
        <a
          href={market.url}
          target="_blank"
          rel="noopener"
          className="scan-link -my-1.5 py-1.5 text-acid-500"
          title={`Opens the ${market.dex} market on DexScreener. NewEra does not execute trades.`}
        >
          Trade ↗
        </a>
      )}
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

export function Skeleton({ h = 48 }: { h?: number }) {
  return (
    <div className="animate-pulse border-b border-edge bg-white/[.02]" style={{ height: h }} aria-hidden />
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l border-edge-strong py-8 pl-5 text-sm leading-relaxed text-fg-dim">
      {children}
    </div>
  )
}
