import { useState } from "react"
import { Link } from "react-router-dom"
import { ago } from "@/lib/api"
import { judgeDistribution } from "@/lib/distributionVerdict"
import type { Launch } from "@/lib/api"
import { type Market } from "@/lib/markets"
import { FlagPill, RiskPill } from "@/components/intel"

/* The tape, at reading density.
 *
 * This was seven columns at a 66px row height, which put FIVE rows on a 1000px
 * screen and left a 400px hole between a token's name and its first figure. A
 * reader deciding what is worth their time had to open a token page to find
 * out — which is the opposite of what a tape is for.
 *
 * Density here is not a style. `/app` is an Operate surface: the visitor is
 * completing a task, and scanability outranks expression. Every column earns
 * its place by answering a question somebody asks before committing money —
 * is it fresh, is it moving, can I get out, who holds it, does it look
 * manufactured — and a row that answers those is a row nobody has to click.
 *
 * Three deliberate mechanics:
 *
 * `table-auto`, not `table-fixed`. Fixed shares were what produced the hole:
 * declaring a percentage per column spreads the leftover width instead of
 * letting the numbers pack. Auto sizing plus `whitespace-nowrap` lets each
 * column hug its content, and the identity cell takes the slack.
 *
 * Columns drop from the least decisive inward as the viewport narrows, so the
 * phone keeps age, identity, liquidity and risk — the irreducible row — and
 * nothing that stays changes meaning because something else left.
 *
 * A missing figure is an em dash, never a zero. "0 holders" is a claim about
 * the token; "we have not measured it" is a gap in our coverage, and a row that
 * renders them identically tells the reader something false.
 */

export type Row = { launch: Launch; market?: Market }

/* Not sticky. `overflow-x-auto` on the wrapper computes overflow-y to auto as
   well, which makes that wrapper the sticky containing block — and since it
   never scrolls vertically, a sticky header inside it can never move. It looked
   like a feature and was inert. */
const HEAD =
  "whitespace-nowrap px-1.5 sm:px-2 py-2 text-right font-mono text-micro font-normal uppercase tracking-[0.1em] text-fg-dim"
const HEAD_L = HEAD.replace("text-right", "text-left")
const NUM = "whitespace-nowrap px-1.5 sm:px-2 py-0 text-right font-mono text-micro tabular-nums"

/** Compact money. A tape column has no room for "$1,234,567". */
const short = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return "—"
  const a = Math.abs(n)
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`
  if (a >= 1_000) return `$${(n / 1_000).toFixed(a >= 10_000 ? 0 : 1)}k`
  if (a >= 1) return `$${n.toFixed(0)}`
  return `$${n.toFixed(2)}`
}

/** Price needs significant figures, not magnitude — these run to 1e-9. */
const price = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return "—"
  if (n >= 1) return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(4)}`
  return `$${n.toPrecision(2)}`
}

/* Percentage change, monochrome.
 *
 * Acid and danger are this product's own verdicts — acid means "this looks
 * organic", danger means "this looks manufactured". Spending them on a price a
 * venue reported would have a reader scanning the tape and reading green as our
 * judgement of the token. The sign carries direction, and it survives
 * colour-blindness, which a hue does not. */
function Pct({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined || !Number.isFinite(v)) return <span className="text-fg-dim">—</span>
  /* Above ten thousand percent the digits stop being information. A pool that
     opened at a millionth of its current price reports a real change of
     1.4e+23%, and `toFixed` hands back exponent notation for anything past
     1e21 — so the tape was rendering `+1.4083641144521061e+23%` in a column
     four characters wide. Everything past the clamp says the same thing. */
  if (v >= 10_000) return <span className="text-fg-muted">&gt;+9,999%</span>
  const s = Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(1)
  return (
    <span className={v === 0 ? "text-fg-dim" : "text-fg-muted"}>
      {v > 0 ? "+" : ""}
      {s}%
    </span>
  )
}

/* The token's own picture, or a monogram standing in for it.
 *
 * Only ~40% of tradable tokens on this chain declare a logo, so the fallback is
 * the common case and has to look deliberate rather than broken. A monogram
 * derived from the symbol is stable per token, needs no network, and occupies
 * exactly the same box — so a row never reflows when an image 404s, and the
 * column edge stays straight down a scrolling tape.
 *
 * The URL is the DEPLOYER'S, which makes it untrusted input behind an image
 * tag. `referrerPolicy` stops our URLs leaking to whatever host they chose,
 * and `loading="lazy"` means a 150-row tape does not open 150 connections to
 * IPFS gateways on first paint. The API already allowlists the scheme; this is
 * the second half of that, because the tag is where it would actually bite.
 */
/** A name a screen reader can read out, whatever the deployer called the token. */
function linkLabel(l: Launch): string {
  const readable = (s: string) => /[\p{L}\p{N}]/u.test(s)
  const parts = [l.symbol, l.name].filter((s) => s && readable(s))
  if (parts.length) return parts.join(" — ")
  // Emoji-only in both fields. The address is the only thing left that speaks.
  return `Token ${l.address.slice(0, 6)}…${l.address.slice(-4)}`
}

export function TokenMark({ src, symbol }: { src: string | null; symbol: string }) {
  const [failed, setFailed] = useState(false)
  const letter = (symbol || "?").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 1) || "?"

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className="grid size-[18px] flex-none self-center place-items-center border border-edge bg-surface-1 font-mono text-[10px] uppercase leading-none text-fg-dim"
      >
        {letter}
      </span>
    )
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="size-[18px] flex-none self-center border border-edge bg-surface-1 object-cover"
    />
  )
}

/* Sorting happens in the DATABASE, and the header is how you ask for it.
 *
 * Every one of these keys maps to an indexed column, so "highest liquidity"
 * means highest on the chain — not highest among whatever rows the browser has
 * already loaded. That distinction is the whole reason the market figures are
 * mirrored server-side; a header that re-ordered the current page would be the
 * same page-narrowing trick `FeedFilters` was written to avoid.
 *
 * A column with no server-side key is not clickable rather than sorting a
 * subset and looking identical to one that works. */
export type SortKey =
  | "new" | "pooled" | "price" | "mcap" | "liquidity"
  | "volume" | "change5m" | "change1h" | "change24h" | "txns5m"
  /* Risk is the one sort that does NOT imply a pool — riskScore is computed at
     launch and is never null, so ordering by it can span the whole index. */
  | "risk"
  /* Volume the CHAIN reported, which is the only ordering that can surface a
     pool no aggregator has indexed yet. */
  | "chainvol"

function Th({
  label,
  sortKey,
  active,
  onSort,
  className,
  align = "right",
}: {
  label: string
  sortKey?: SortKey
  active?: SortKey
  onSort?: (k: SortKey) => void
  className: string
  align?: "left" | "right"
}) {
  const on = !!sortKey && !!onSort
  const isActive = on && active === sortKey
  return (
    <th
      scope="col"
      className={className}
      /* Only the column actually ordering the query claims it. These are all
         descending — "most liquidity", "biggest mover" — so there is no
         direction to toggle and none is announced. */
      aria-sort={isActive ? "descending" : undefined}
    >
      {on ? (
        <button
          type="button"
          onClick={() => onSort!(sortKey!)}
          className={`chip inline-flex items-center gap-1 uppercase tracking-[0.1em] hover:text-fg ${
            isActive ? "text-acid-500" : ""
          } ${align === "right" ? "flex-row-reverse" : ""}`}
        >
          {label}
          {/* Marks the active column without reserving width in the others,
              which would drag every heading off its own column edge. */}
          {isActive && <span aria-hidden="true">↓</span>}
        </button>
      ) : (
        label
      )}
    </th>
  )
}

export function LaunchTable({
  rows,
  marketStatus = "ok",
  caption,
  sort,
  onSort,
  watched,
  onToggleWatch,
}: {
  rows: Row[]
  marketStatus?: "ok" | "loading" | "down"
  /** Screen-reader label; the visible heading sits above the table. */
  caption: string
  /** The key the SERVER is ordering by. Absent means the table is unsorted. */
  sort?: SortKey
  onSort?: (k: SortKey) => void
  /* The reader's own list. Both or neither: without a handler the column is
     not rendered at all, so the tables that have nothing to do with a
     watchlist — a theme's launches, a creator's — are untouched. */
  watched?: Set<string>
  onToggleWatch?: (address: string) => void
}) {
  const th = (label: string, className: string, sortKey?: SortKey, align?: "left" | "right") => (
    <Th
      label={label}
      className={className}
      sortKey={sortKey}
      active={sort}
      onSort={onSort}
      align={align}
    />
  )
  return (
    /* `relative` is load-bearing, not decoration.
     *
     * Overflow does not clip an absolutely-positioned descendant whose
     * containing block sits OUTSIDE the scroller. Every risk cell carries an
     * `sr-only` span, and Tailwind's sr-only is `position: absolute` — so with
     * a static wrapper those spans escaped the scroll box entirely and set
     * their containing block to the page. Measured at 320px: the document
     * reached 329px against a 320px viewport, and /app was the one route that
     * scrolled sideways on a phone. The table itself was innocent and properly
     * clipped; it was the invisible labels inside it that leaked.
     *
     * Making the wrapper a containing block clips them with everything else. */
    <div className="relative overflow-x-auto">
      <table className="w-full table-auto border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-edge-strong">
            {onToggleWatch && (
              <th scope="col" className={`${HEAD_L} w-0`}>
                <span className="sr-only">Watching</span>
              </th>
            )}
            {th("Age", HEAD_L, "new", "left")}
            {/* Two different ages, because they answer different questions.
                "Age" is how long the token has existed; "Pool" is how long it
                has been buyable, which is the one that decides whether you are
                early. They can be hours apart. */}
            {th("Pool", `${HEAD_L} hidden sm:table-cell`, "pooled", "left")}
            <th scope="col" className={`${HEAD_L} w-full`}>Token</th>
            {th("Price", `${HEAD} hidden xl:table-cell`, "price")}
            {th("MCap", `${HEAD} hidden lg:table-cell`, "mcap")}
            {th("Liq", HEAD, "liquidity")}
            {th("Vol 24h", `${HEAD} hidden md:table-cell`, "volume")}
            {th("5m", `${HEAD} hidden xl:table-cell`, "change5m")}
            {th("1h", `${HEAD} hidden lg:table-cell`, "change1h")}
            {th("24h", `${HEAD} hidden sm:table-cell`, "change24h")}
            {th("TX 5m", `${HEAD} hidden md:table-cell`, "txns5m")}
            {/* Holders and Top10 come from the distribution read, which is not
                a column the index can order by — so they stay unsortable
                rather than silently sorting the loaded page. */}
            <th scope="col" className={`${HEAD} hidden xl:table-cell`}>Holders</th>
            <th scope="col" className={`${HEAD} hidden xl:table-cell`}>Top10</th>
            {th("Risk", HEAD, "risk")}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ launch, market }) => (
            <LaunchRow
              key={launch.address}
              launch={launch}
              market={market}
              marketStatus={marketStatus}
              watched={watched?.has(launch.address.toLowerCase())}
              onToggleWatch={onToggleWatch}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LaunchRow({
  launch,
  market,
  marketStatus,
  watched,
  onToggleWatch,
}: {
  launch: Launch
  market?: Market
  marketStatus: "ok" | "loading" | "down"
  watched?: boolean
  onToggleWatch?: (address: string) => void
}) {
  const risky = launch.riskScore >= 40
  const traded = !!market?.liquidityUsd
  const live = (market?.txns5m ?? 0) > 0
  const d = launch.distribution
  const verdict = d ? judgeDistribution(d) : null

  /* "No market" is the product's central claim about most of these rows, so it
     is written once in the depth column rather than repeated as eight dashes.
     A pending or failed lookup must never render as that claim. */
  const note =
    marketStatus === "loading" ? "…" : marketStatus === "down" ? "?" : "—"

  const cell = (v: string | null, extra = "") =>
    traded ? <span className={extra}>{v}</span> : <span className="text-fg-dim">{note}</span>

  return (
    <tr className={`scan-tr border-b border-edge ${risky ? "is-risky" : ""}`}>
      {/* The reader's own mark, and the only cell in this table that records a
          decision rather than a measurement. Acid because it is a state they
          set, like a pressed chip — never because the token deserves it. */}
      {onToggleWatch && (
        <td className="px-1 py-0">
          <button
            type="button"
            onClick={() => onToggleWatch(launch.address)}
            aria-pressed={!!watched}
            /* px-2 clears the 24px touch floor on the narrow axis; the row's
               own height covers the other one. */
            className={`chip px-2 py-2 text-xs leading-none ${
              watched ? "text-acid-500" : "text-fg-dim/50 hover:text-fg"
            }`}
          >
            <span className="sr-only">
              {watched ? "Stop watching" : "Watch"} {launch.symbol || launch.address}
            </span>
            <span aria-hidden="true">{watched ? "★" : "☆"}</span>
          </button>
        </td>
      )}
      <td className="whitespace-nowrap px-1.5 py-0 font-mono text-micro tabular-nums text-fg-dim sm:px-2">
        {ago(launch.ageSeconds)}
      </td>

      {/* Venue sits with the pool age rather than beside the name: it qualifies
          where the token trades, and v3/v4 is the difference between a pool
          with its own address and one keyed inside a singleton. A token with no
          pool cannot appear here — the feed asks for tradable rows — but the
          dash is kept because this table is also rendered from other queries. */}
      <td className="hidden whitespace-nowrap px-1.5 py-0 font-mono text-micro tabular-nums text-fg-dim sm:table-cell sm:px-2">
        {launch.pool?.pooledAt ? (
          <span className="inline-flex items-baseline gap-1">
            {ago(
              Math.max(
                0,
                Math.floor((Date.now() - new Date(launch.pool.pooledAt).getTime()) / 1000)
              )
            )}
            <span className="text-fg-dim/70">{launch.pool.venue}</span>
          </span>
        ) : (
          "—"
        )}
      </td>

      {/* Identity takes the slack, and the flags sit inline rather than on a
          second line — a second line is what doubled the row height and halved
          how much of the tape a reader could see at once. */}
      <td className="px-1.5 py-0 sm:px-2">
        <Link
          to={`/app/token/${launch.address}`}
          /* Named explicitly, because the subtree cannot be trusted to name it.
           *
           * Two ways this link ended up unreadable. Tokens on this chain are
           * routinely launched with emoji-only tickers, so the visible text can
           * carry no letters at all — the a11y suite caught a link announcing
           * itself as "🙈🙈". And the monogram beside it is decorative, marked
           * aria-hidden, yet still reachable by anything reading text content
           * rather than the accessibility tree, which turned the same link into
           * "?🙈🙈".
           *
           * An explicit label ends both: it says the symbol and the name, and
           * falls back to the address when neither contains a readable
           * character, so every row announces something a person can act on. */
          aria-label={linkLabel(launch)}
          className="flex min-w-0 items-baseline gap-x-2 py-2"
        >
          {/* The name truncates; it does NOT grow. `flex-1` on it consumed the
              cell's slack and shoved the flags to the far right edge, so a COPY
              marker floated a screen-width away from the token it describes.
              Flags belong against the name they qualify. */}
          <TokenMark src={launch.logo} symbol={launch.symbol} />
          <span className="font-mono text-xs font-semibold text-fg">{launch.symbol || "—"}</span>
          {/* The cap is responsive. A flat 26ch let the identity cell alone
              exceed a 320px viewport once age, liquidity and risk were beside
              it, and `whitespace-nowrap` on the numerics means the table cannot
              absorb that by wrapping. */}
          <span className="min-w-0 max-w-[7ch] truncate text-micro text-fg-dim sm:max-w-[18ch] lg:max-w-[26ch]">
            {launch.name}
          </span>
          {(launch.spoofFlags || []).slice(0, 1).map((f) => (
            <FlagPill key={f} flag={f} />
          ))}
          {launch.dupeCount > 0 &&
            !(launch.spoofFlags || []).some(
              (f) => f === "NAME_COLLISION" || f === "SYMBOL_COLLISION"
            ) && <span className="font-mono text-micro font-semibold text-warn">COPY</span>}
          {verdict?.badge && (
            <span
              className={`whitespace-nowrap font-mono text-micro font-semibold ${
                verdict.severity === "bad" ? "text-danger" : "text-warn"
              }`}
            >
              {verdict.badge}
            </span>
          )}
        </Link>
      </td>

      <td className={`${NUM} hidden text-fg-muted xl:table-cell`}>
        {cell(price(market?.priceUsd))}
      </td>
      <td className={`${NUM} hidden text-fg-muted lg:table-cell`}>
        {cell(short(market?.marketCap))}
      </td>
      <td className={`${NUM} ${traded ? "text-fg" : "text-fg-dim"}`}>
        {cell(short(market?.liquidityUsd))}
      </td>
      {/* Dollars when an aggregator priced it, ETH when only the chain did.
          Mixing units in one column is normally a scanning mistake, and the Ξ
          is there so it never reads as dollars. It earns the exception because
          the alternative is a dash: on v4 pools no aggregator has indexed —
          which is most of them in a token's first minutes — a dash says "no
          activity" about something that is trading right now, and being early
          is the entire product. The dimmer tone marks it as the lesser
          measurement without hiding it. */}
      <td className={`${NUM} hidden text-fg-muted md:table-cell`}>
        {market?.volume24h !== null && market?.volume24h !== undefined ? (
          cell(short(market.volume24h))
        ) : launch.chainVolEth24h ? (
          <span className="text-fg-dim" title="Read from chain swaps, in ETH">
            Ξ{launch.chainVolEth24h < 0.01
              ? launch.chainVolEth24h.toExponential(1)
              : launch.chainVolEth24h.toFixed(2)}
          </span>
        ) : (
          cell(null)
        )}
      </td>

      <td className={`${NUM} hidden xl:table-cell`}>
        {traded ? <Pct v={market?.priceChange5m} /> : <span className="text-fg-dim">{note}</span>}
      </td>
      <td className={`${NUM} hidden lg:table-cell`}>
        {traded ? <Pct v={market?.priceChange1h} /> : <span className="text-fg-dim">{note}</span>}
      </td>
      <td className={`${NUM} hidden sm:table-cell`}>
        {traded ? <Pct v={market?.priceChange24h} /> : <span className="text-fg-dim">{note}</span>}
      </td>

      {/* Liveness is the one place on the row where colour IS a judgement:
          it separates "trading now" from "traded at some point today", which is
          what the section is ranked on. */}
      <td className={`${NUM} hidden md:table-cell ${live ? "text-acid-500" : "text-fg-dim"}`}>
        {!traded || market?.txns5m === null || market?.txns5m === undefined
          ? note
          : market.txns5m.toLocaleString("en-US")}
      </td>

      <td className={`${NUM} hidden text-fg-muted xl:table-cell`}>
        {d ? d.holders.toLocaleString("en-US") : <span className="text-fg-dim">—</span>}
      </td>
      <td className={`${NUM} hidden xl:table-cell`}>
        {d && d.top10Pct !== null ? (
          <span className={d.top10Pct >= 90 ? "text-danger" : "text-fg-muted"}>
            {Math.round(d.top10Pct)}%
          </span>
        ) : (
          <span className="text-fg-dim">—</span>
        )}
      </td>

      <td className="whitespace-nowrap px-1.5 py-0 text-right sm:px-2">
        <RiskPill score={launch.riskScore} />
      </td>
    </tr>
  )
}
