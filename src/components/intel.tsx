import { Link } from "react-router-dom"
import type { Launch, Theme, ThemeStatus } from "@/lib/api"
import { ago } from "@/lib/api"

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

const STATUS_STYLE: Record<ThemeStatus, string> = {
  EMERGING: "text-acid-500 bg-acid-500/12",
  HOT: "text-[#ff9f45] bg-[#ff9f45]/12",
  SATURATED: "text-[#8b93a1] bg-[#8b93a1]/12",
  DECAYING: "text-fg-dim bg-white/[.06]",
}

export function StatusBadge({ status }: { status: ThemeStatus }) {
  return (
    <span
      className={`flex-none rounded-md px-2 py-[3px] text-micro font-bold uppercase tracking-[0.06em] ${STATUS_STYLE[status]}`}
    >
      {status}
    </span>
  )
}

export function RiskPill({ score }: { score: number }) {
  const tone =
    score >= 40
      ? "text-danger bg-danger/12"
      : score >= 15
        ? "text-warn bg-warn/12"
        : "text-acid-500 bg-acid-500/10"
  return (
    <span
      className={`min-w-[34px] rounded-md px-[7px] py-[3px] text-center font-mono text-micro font-semibold ${tone}`}
      title={`Spam risk ${score}/100 — how much this looks like machine-generated noise, not a price prediction`}
    >
      {score}
    </span>
  )
}

export function FlagPill({ flag }: { flag: string }) {
  return (
    <span
      className="rounded-[5px] border border-danger/25 bg-danger/12 px-[6px] py-[2px] text-micro font-bold tracking-[0.04em] text-danger"
      title={FLAG_TEXT[flag] || flag}
    >
      {FLAG_SHORT[flag] || flag}
    </span>
  )
}

/** One row of the live tape. */
export function LaunchRow({ launch, isNew }: { launch: Launch; isNew?: boolean }) {
  return (
    <a
      href={`${EXPLORER}/token/${launch.address}`}
      target="_blank"
      rel="noopener"
      className={`grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-white/[.022] px-3.5 py-3 transition-colors hover:border-edge-strong ${
        launch.riskScore >= 40 ? "border-l-2 border-l-danger/55 border-edge" : "border-edge"
      } ${isNew ? "animate-[flash_1.4s_ease-out]" : ""}`}
    >
      <div className="text-right font-mono text-xs text-fg-dim">{ago(launch.ageSeconds)}</div>
      <div className="min-w-0">
        <div className="truncate font-mono text-sm font-semibold text-fg">
          {launch.symbol || "—"}
        </div>
        <div className="truncate text-xs text-fg-dim">{launch.name}</div>
      </div>
      <div className="flex flex-none items-center gap-2">
        {launch.devBuyEth > 0 && (
          <span
            className="rounded-md bg-acid-500/10 px-[7px] py-[3px] font-mono text-micro text-acid-500"
            title={`Creator committed ${launch.devBuyEth} ETH at launch`}
          >
            {launch.devBuyEth.toFixed(2)}Ξ
          </span>
        )}
        {(launch.spoofFlags || []).slice(0, 2).map((f) => (
          <FlagPill key={f} flag={f} />
        ))}
        <RiskPill score={launch.riskScore} />
      </div>
    </a>
  )
}

/** One theme card in the left panel. */
export function ThemeCard({ theme }: { theme: Theme }) {
  return (
    <Link
      to={`/app/theme/${theme.slug}`}
      className={`block rounded-2xl border p-4 transition-colors ${
        theme.status === "EMERGING"
          ? "border-acid-500/35 bg-acid-500/[.035] hover:border-acid-500/60"
          : "border-edge bg-white/[.025] hover:border-edge-strong"
      } ${theme.isOrganic ? "" : "opacity-60"}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2.5">
        <span className="min-w-0 flex-1 truncate text-base font-semibold text-fg">
          {theme.label}
        </span>
        <StatusBadge status={theme.status} />
      </div>

      <div className="flex flex-wrap gap-3.5 text-xs text-fg-dim">
        <span>
          <b className="font-semibold text-[#c8cdd6]">{theme.launchCount}</b> launches
        </span>
        {/* The comparison that carries the whole judgement. */}
        <span className={theme.isOrganic ? "text-acid-500" : "font-semibold text-danger"}>
          {theme.isOrganic ? (
            <>
              <b className="font-semibold">{theme.creatorCount}</b> creators
            </>
          ) : (
            <>
              {theme.creatorCount} creator{theme.creatorCount === 1 ? "" : "s"} · one-wallet spam
            </>
          )}
        </span>
        <span>{ago(theme.ageMinutes * 60)} old</span>
      </div>

      {theme.samples?.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {theme.samples.map((s) => (
            <span
              key={s.address}
              className="max-w-[130px] truncate rounded-md border border-edge bg-white/[.04] px-2 py-[3px] font-mono text-micro text-fg-muted"
            >
              {s.symbol || s.name}
            </span>
          ))}
        </div>
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
      className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${
        on
          ? "border-acid-500/45 bg-acid-500/[.09] text-acid-500"
          : "border-edge bg-white/[.03] text-fg-muted hover:border-edge-strong hover:text-fg"
      }`}
    >
      {children}
    </button>
  )
}

export function Skeleton({ h = 58 }: { h?: number }) {
  return (
    <div
      className="animate-pulse rounded-xl bg-white/[.04]"
      style={{ height: h }}
      aria-hidden
    />
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-edge bg-white/[.02] px-5 py-11 text-center text-sm leading-relaxed text-fg-dim">
      {children}
    </div>
  )
}
