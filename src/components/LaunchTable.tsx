import { Link } from "react-router-dom"
import { ago } from "@/lib/api"
import type { Launch } from "@/lib/api"
import { usd, type Market } from "@/lib/markets"
import { FlagPill, RiskPill } from "@/components/intel"

/* The tape, as columns.
 *
 * Every launch used to render as a two-line block: identity on one line with
 * the age and score pushed to the far right, then a run-on sentence of
 * "$64k liquidity  $78k traded 24h  228 trades  +366% 24h". Nothing lined up
 * between one row and the next, so the only way to answer "which of these has
 * the most liquidity" was to read all of them. That is what made a page of
 * measurements read as an undifferentiated list.
 *
 * The figures are the same figures. Putting them in aligned, right-set,
 * tabular columns is the whole change, and it is what a scanning reader needs:
 * the eye travels one column, not thirty labels.
 *
 * A real <table>, not a grid of divs — this list is genuinely tabular, and the
 * previous markup announced nothing about rows or columns to a screen reader.
 *
 * Columns arrive with width rather than wrapping. Identity, age and risk are
 * the irreducible row and are always present; depth and volume appear when
 * there is room to align them. Nothing is hidden that changes the meaning of
 * what stays.
 */

export type Row = { launch: Launch; market?: Market }

/* Not sticky. `overflow-x-auto` on the wrapper computes overflow-y to auto as
   well, which makes that wrapper the sticky containing block — and since it
   never scrolls vertically, a sticky header inside it can never move. It looked
   like a feature and was inert. */
const HEAD =
  "py-2 text-left font-mono text-micro font-normal uppercase tracking-[0.12em] text-fg-dim"
const NUM = "py-3 pl-4 text-right font-mono text-xs tabular-nums"

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
      {/* table-fixed, with a declared share per column. Left to `auto`, the
          browser sizes every column to its content and hands ALL the leftover
          width to the one flexible cell — which put a 400px hole between a
          token's name and its liquidity at 1920, and made the numbers read as
          a separate right-hand block rather than as that row's figures.
          Hidden columns simply drop out and the remaining shares renormalise. */}
      {/* The minimum tracks the columns that are actually visible. A flat
          `min-w-[42rem]` forced a 672px table inside a 390px phone even though
          only Age, Token and Risk render there — a horizontal scrollbar over
          mostly empty space, for no gain. */}
      <table className="w-full table-fixed border-collapse sm:min-w-[32rem] lg:min-w-[46rem]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-edge">
            <th scope="col" className={`${HEAD} w-[6%] pr-4`}>Age</th>
            <th scope="col" className={`${HEAD} w-[30%]`}>Token</th>
            <th scope="col" className={`${HEAD} hidden w-[14%] pl-4 text-right lg:table-cell`}>Liquidity</th>
            <th scope="col" className={`${HEAD} hidden w-[14%] pl-4 text-right lg:table-cell`}>Traded 24h</th>
            <th scope="col" className={`${HEAD} hidden w-[11%] pl-4 text-right xl:table-cell`}>Trades</th>
            <th scope="col" className={`${HEAD} hidden w-[12%] pl-4 text-right sm:table-cell`}>24h</th>
            <th scope="col" className={`${HEAD} w-[9%] pl-4 text-right`}>Risk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ launch, market }) => (
            <TapeRow
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

function TapeRow({
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
  const chg = market?.priceChange24h ?? null
  const tone = chg === null ? "text-fg-dim" : chg >= 0 ? "text-acid-500" : "text-danger"

  /* "No market" is the product's central claim about most of these rows, so it
     is written out once across the market columns rather than repeated as four
     dashes that say nothing. A pending or failed lookup must never render as
     that claim — those are different sentences. */
  const marketNote =
    marketStatus === "loading" ? "checking…" : marketStatus === "down" ? "unavailable" : "no market yet"

  return (
    <tr className={`scan-tr border-b border-edge ${risky ? "is-risky" : ""}`}>
      <td className="py-3 pl-3 pr-4 align-baseline font-mono text-micro tabular-nums text-fg-dim">
        {ago(launch.ageSeconds)}
      </td>

      <td className="py-3 align-baseline">
        <Link
          to={`/app/token/${launch.address}`}
          className="-my-1 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1"
        >
          <span className="font-mono text-sm font-semibold text-fg">{launch.symbol || "—"}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-fg-dim">{launch.name}</span>
        </Link>
        {(launch.spoofFlags?.length || launch.dupeCount > 0 || launch.devBuyEth > 0) && (
          <span className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {(launch.spoofFlags || []).slice(0, 2).map((f) => (
              <FlagPill key={f} flag={f} />
            ))}
            {launch.dupeCount > 0 &&
              !(launch.spoofFlags || []).some(
                (f) => f === "NAME_COLLISION" || f === "SYMBOL_COLLISION"
              ) && <span className="font-mono text-micro font-semibold text-warn">COPY</span>}
            {launch.devBuyEth > 0 && (
              <span
                className="font-mono text-micro text-fg-dim"
                title={`Creator committed ${launch.devBuyEth} ETH at launch`}
              >
                {launch.devBuyEth.toFixed(2)}Ξ staked
              </span>
            )}
          </span>
        )}
      </td>

      {/* Each market cell mirrors its own header's visibility. A colSpan cannot
          work here — the column count changes at three breakpoints, so no single
          span is correct at every width, and a wrong one drags the risk column
          out of alignment on exactly one size. The claim about an absent market
          rides in the leftmost market cell instead of collapsing the group. */}
      <td className={`${NUM} hidden lg:table-cell ${traded ? "text-fg-muted" : "text-fg-dim"}`}>
        {traded ? usd(market!.liquidityUsd) : marketNote}
      </td>
      <td className={`${NUM} hidden text-fg-muted lg:table-cell`}>
        {traded ? usd(market!.volume24h) : "—"}
      </td>
      <td className={`${NUM} hidden text-fg-dim xl:table-cell`}>
        {traded && market!.txns24h !== null ? market!.txns24h.toLocaleString("en-US") : "—"}
      </td>
      <td className={`${NUM} hidden sm:table-cell ${traded ? tone : "text-fg-dim"}`}>
        {traded && chg !== null
          ? `${chg >= 0 ? "+" : ""}${chg.toFixed(Math.abs(chg) >= 100 ? 0 : 1)}%`
          : "—"}
      </td>

      <td className="py-3 pl-4 text-right align-baseline">
        <RiskPill score={launch.riskScore} />
      </td>
    </tr>
  )
}
