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
  if (v === null || v === undefined) return <span className="text-fg-dim">—</span>
  const s = Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(1)
  return (
    <span className={v === 0 ? "text-fg-dim" : "text-fg-muted"}>
      {v > 0 ? "+" : ""}
      {s}%
    </span>
  )
}

export function LaunchTable({
  rows,
  marketStatus = "ok",
  caption,
}: {
  rows: Row[]
  marketStatus?: "ok" | "loading" | "down"
  /** Screen-reader label; the visible heading sits above the table. */
  caption: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-auto border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-edge-strong">
            <th scope="col" className={HEAD_L}>Age</th>
            <th scope="col" className={`${HEAD_L} w-full`}>Token</th>
            <th scope="col" className={`${HEAD} hidden xl:table-cell`}>Price</th>
            <th scope="col" className={`${HEAD} hidden lg:table-cell`}>MCap</th>
            <th scope="col" className={HEAD}>Liq</th>
            <th scope="col" className={`${HEAD} hidden md:table-cell`}>Vol 24h</th>
            <th scope="col" className={`${HEAD} hidden xl:table-cell`}>5m</th>
            <th scope="col" className={`${HEAD} hidden lg:table-cell`}>1h</th>
            <th scope="col" className={`${HEAD} hidden sm:table-cell`}>24h</th>
            <th scope="col" className={`${HEAD} hidden md:table-cell`}>TX 5m</th>
            <th scope="col" className={`${HEAD} hidden xl:table-cell`}>Holders</th>
            <th scope="col" className={`${HEAD} hidden xl:table-cell`}>Top10</th>
            <th scope="col" className={HEAD}>Risk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ launch, market }) => (
            <LaunchRow
              key={launch.address}
              launch={launch}
              market={market}
              marketStatus={marketStatus}
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
}: {
  launch: Launch
  market?: Market
  marketStatus: "ok" | "loading" | "down"
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
      <td className="whitespace-nowrap px-1.5 py-0 font-mono text-micro tabular-nums text-fg-dim sm:px-2">
        {ago(launch.ageSeconds)}
      </td>

      {/* Identity takes the slack, and the flags sit inline rather than on a
          second line — a second line is what doubled the row height and halved
          how much of the tape a reader could see at once. */}
      <td className="px-1.5 py-0 sm:px-2">
        <Link
          to={`/app/token/${launch.address}`}
          className="flex min-w-0 items-baseline gap-x-2 py-2"
        >
          {/* The name truncates; it does NOT grow. `flex-1` on it consumed the
              cell's slack and shoved the flags to the far right edge, so a COPY
              marker floated a screen-width away from the token it describes.
              Flags belong against the name they qualify. */}
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
      <td className={`${NUM} hidden text-fg-muted md:table-cell`}>
        {cell(short(market?.volume24h))}
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
