import { Link } from "react-router-dom"
import type { Launch, Theme, ThemeStatus } from "@/lib/api"
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

export function RiskPill({ score }: { score: number }) {
  const tone = score >= 40 ? "text-danger" : score >= 15 ? "text-warn" : "text-acid-500"
  return (
    <span
      className={`min-w-[2.2rem] text-right font-mono text-sm font-semibold ${tone}`}
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
      title={FLAG_TEXT[flag] || flag}
    >
      {FLAG_SHORT[flag] || flag}
    </span>
  )
}

/** One row of the live tape. */
export function LaunchRow({ launch, isNew }: { launch: Launch; isNew?: boolean }) {
  const risky = launch.riskScore >= 40
  return (
    <a
      href={`${EXPLORER}/token/${launch.address}`}
      target="_blank"
      rel="noopener"
      className={`scan-row grid grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-4 border-b border-edge py-3 pl-3 ${
        isNew ? "animate-[flash_1.4s_ease-out]" : ""
      }`}
    >
      <span className="font-mono text-micro text-fg-dim">{ago(launch.ageSeconds)}</span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-sm font-semibold text-fg">{launch.symbol || "—"}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-fg-dim">{launch.name}</span>
      </span>
      <span className="flex flex-none items-baseline gap-3">
        {launch.devBuyEth > 0 && (
          <span
            className="font-mono text-micro text-fg-dim"
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
      {/* A high-risk row keeps a marker, but as a hairline in the gutter rather
          than a 2px coloured border on a card. */}
      {risky && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-px bg-danger/70" />
      )}
    </a>
  )
}

/** One cluster in the left panel. */
export function ThemeCard({ theme }: { theme: Theme }) {
  return (
    <Link
      to={`/app/theme/${theme.slug}`}
      viewTransition
      className={`scan-row block border-b border-edge py-4 pl-3 ${
        theme.isOrganic ? "" : "opacity-70"
      }`}
    >
      <span className="flex flex-wrap items-baseline gap-x-3">
        {/* The row and the page it opens are the same object, so the browser
            morphs one into the other instead of cutting. Only one element may
            carry a given name at a time, which holds because the row unmounts
            as the detail page mounts. */}
        <span
          style={{ viewTransitionName: `cluster-${theme.slug}` }}
          className="min-w-0 flex-1 truncate text-base font-semibold text-fg"
        >
          {theme.label}
        </span>

        {/* The discriminating figure, not the status.
         *
            Every live cluster currently reports EMERGING — measured, 100 of
            100 — so the badge was the loudest coloured element on the page
            and carried no information at the exact moment it was meant to.
            What actually separates a narrative from one wallet is how many
            distinct wallets arrived, so that is what gets the visual: a bar
            per launch, lit for each independent creator. */}
        <span
          aria-hidden
          className="flex flex-none items-center gap-[2px]"
          title={`${theme.creatorCount} of ${theme.launchCount} launches from distinct wallets`}
        >
          {Array.from({ length: Math.min(theme.launchCount, 10) }).map((_, i) => (
            <span
              key={i}
              className={`h-3 w-[3px] ${
                i < theme.creatorCount ? "bg-acid-500" : "bg-edge-strong"
              }`}
            />
          ))}
        </span>
      </span>

      <span className="mt-1.5 flex flex-wrap gap-x-4 font-mono text-micro text-fg-dim">
        <span>
          <b className="font-semibold text-fg-muted">{theme.launchCount}</b>{" "}
          {theme.launchCount === 1 ? "launch" : "launches"}
        </span>
        {/* The comparison that carries the whole judgement. */}
        <span className={theme.isOrganic ? "text-acid-500" : "text-danger"}>
          {theme.isOrganic
            ? `${theme.creatorCount} creator${theme.creatorCount === 1 ? "" : "s"}`
            : `${theme.creatorCount} creator${theme.creatorCount === 1 ? "" : "s"} · one-wallet spam`}
        </span>
        <span>{ago(theme.ageMinutes * 60)} old</span>
        <StatusBadge status={theme.status} />
      </span>

      {theme.samples?.length > 0 && (
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-micro text-fg-dim">
          {theme.samples.slice(0, 6).map((s, i) => (
            <span key={s.address} className="max-w-[10rem] truncate">
              {i > 0 && <span className="mr-3 opacity-40">/</span>}
              {s.symbol || s.name}
            </span>
          ))}
        </span>
      )}
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
