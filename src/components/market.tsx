import { useMemo, useState } from "react"
import { formatUnits } from "viem"
import { explorerTx } from "@/lib/chain"
import { useTrades, type TradeSource } from "@/lib/trades"
import { shortAddr } from "@/lib/api"
import { SectionHead } from "@/components/shell"

/* The chart and the tape.
 *
 * Neither is our own market data system, which is the point. The candles are
 * DexScreener's — they already index this chain, and rebuilding an OHLC pipeline
 * to draw the same thing would be work with no product in it. What IS ours is
 * the timeframe control: the embed accepts an `interval`, so the buttons are in
 * our type and our layout while the rendering stays theirs.
 *
 * The tape is read from the pool's Swap events directly. DexScreener publishes
 * no endpoint for individual fills, so the alternative was their iframe pane,
 * and reading the chain gives us real rows we can style, link and colour. */

const TIMEFRAMES = [
  { label: "1m", interval: "1" },
  { label: "5m", interval: "5" },
  { label: "15m", interval: "15" },
  { label: "1h", interval: "60" },
  { label: "4h", interval: "240" },
  { label: "1D", interval: "1D" },
] as const

export function Chart({ venueUrl, symbol }: { venueUrl: string; symbol: string }) {
  const [tf, setTf] = useState<string>("15")
  const [shown, setShown] = useState(false)

  /* Changing the interval remounts the iframe by key, which is the only way to
     drive an embed we do not control. Keyed rather than mutated so React tears
     down the old frame instead of leaving a stale chart behind it. */
  const src = useMemo(() => {
    const base = venueUrl.split("?")[0]
    const params = new URLSearchParams({
      embed: "1",
      theme: "dark",
      info: "0",
      trades: "0",
      chartLeftToolbar: "0",
      chartTheme: "dark",
      chartType: "usd",
      interval: tf,
    })
    return `${base}?${params}`
  }, [venueUrl, tf])

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge pb-3">
        <h2 className="text-[clamp(1.15rem,1.6vw,1.4rem)] font-semibold text-fg">Price</h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Chart timeframe">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.interval}
              type="button"
              aria-pressed={tf === t.interval}
              onClick={() => {
                setTf(t.interval)
                setShown(true)
              }}
              className={`border px-2.5 py-1 font-mono text-xs transition-colors ${
                tf === t.interval
                  ? "border-acid-500 text-acid-500"
                  : "border-edge text-fg-dim hover:text-fg"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loaded on request, not on arrival.
       *
       * This is somebody else's application in a frame. Measured on a token
       * page: mounting it pulled 8.8MB of JavaScript across 70 files — a 3.2MB
       * page bundle, a 2.6MB library, and Google Analytics — against 630kB for
       * the whole of NewEra. It was 93% of the weight of the page and none of
       * it is ours.
       *
       * `loading="lazy"` did nothing, because the chart is in the first
       * viewport on this layout; lazy only defers frames below the fold.
       *
       * There is a second reason, and it is the better one. Embedding the frame
       * on load runs a third party's analytics on every visitor who opens a
       * token page, whether or not they ever look at the chart. Our privacy
       * page says what we load and when — this makes that sentence true by
       * construction rather than by wording. */}
      <div className="mt-4 overflow-hidden border border-edge">
        {shown ? (
          <iframe
            key={tf}
            src={src}
            title={`${symbol || "Token"} price chart`}
            className="h-[420px] w-full border-0 sm:h-[520px]"
          />
        ) : (
          /* The same height as the frame it becomes, so nothing moves when it
             loads — the whole point of having measured the layout shift. */
          <div className="flex h-[420px] w-full flex-col items-center justify-center gap-4 px-6 text-center sm:h-[520px]">
            <p className="measure text-sm leading-relaxed text-fg-muted">
              The candle chart is DexScreener&apos;s, embedded from their site. It loads about 9MB
              and runs their analytics, so we do not fetch it until you ask.
            </p>
            <button
              type="button"
              onClick={() => setShown(true)}
              className="block-btn border border-acid-500 text-acid-500"
            >
              Load the chart
            </button>
            <p className="font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
              Everything else on this page is read from the chain directly
            </p>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-fg-dim">
        Candles by DexScreener, which indexes this chain. Timeframe is ours; the data is theirs.
      </p>
    </section>
  )
}

/* ── The tape ──────────────────────────────────────────────────────────── */

function ageLabel(s: number | null): string {
  if (s === null) return "—"
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

function amount(wei: bigint, decimals: number, max = 4): string {
  const n = Number(formatUnits(wei, decimals))
  if (n === 0) return "0"
  if (n < 0.0001) return n.toExponential(1)
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 })
  return n.toLocaleString("en-US", { maximumFractionDigits: max })
}

export function Trades({
  source,
  symbol,
  decimals,
}: {
  source: TradeSource | null
  symbol: string
  decimals: number
}) {
  const result = useTrades(source)

  if (!source) return null

  return (
    <section className="mt-[7vh]">
      <SectionHead
        title="Trades happening"
        noteLive
        note={
          result === null
            ? "reading the pool…"
            : result.ok
              ? "live · from the pool"
              : "connection lost — showing the last read"
        }
      />

      {result === null ? (
        <div className="mt-4 flex flex-col gap-2" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 animate-pulse bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]" />
          ))}
        </div>
      ) : result.trades.length === 0 ? (
        <p className="measure mt-5 text-sm leading-relaxed text-fg-muted">
          No fills in the last few minutes. The pool exists, but nobody is trading it right now.
        </p>
      ) : (
        <>
          {/* A real table, so a screen reader announces rows and columns instead
              of reading a wall of unlabelled numbers. */}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-sm sm:min-w-[30rem] lg:min-w-[34rem]">
              {/* Every other table on the site carries one. A screen reader
                  announcing "table with 6 columns, 30 rows" and nothing else
                  gives a reader no way to know what they have landed in. */}
              <caption className="sr-only">
                The most recent fills in this pool, newest first — age, side, ETH, tokens, trader
                and a link to each transaction.
              </caption>
              <thead>
                <tr className="text-left font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
                  <th scope="col" className="w-[10%] py-2 pr-4 font-normal">Age</th>
                  <th scope="col" className="w-[12%] py-2 pr-4 font-normal">Side</th>
                  <th scope="col" className="w-[20%] py-2 pr-4 text-right font-normal">ETH</th>
                  <th scope="col" className="w-[26%] py-2 pr-4 text-right font-normal"><span className="block truncate">{symbol || "Tokens"}</span></th>
                  <th scope="col" className="hidden w-[22%] py-2 pr-4 font-normal sm:table-cell">Trader</th>
                  <th scope="col" className="hidden w-[10%] py-2 text-right font-normal sm:table-cell">Tx</th>
                </tr>
              </thead>
              <tbody>
                {result.trades.map((t) => (
                  <tr key={`${t.txHash}-${t.blockNumber}-${t.tokenWei}`} className="border-t border-edge">
                    <td className="py-2 pr-4 font-mono text-xs text-fg-dim">{ageLabel(t.ageSeconds)}</td>
                    <td className={`py-2 pr-4 font-mono text-xs font-semibold ${t.kind === "buy" ? "text-acid-500" : "text-danger"}`}>
                      {t.kind === "buy" ? "Buy" : "Sell"}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-xs text-fg-muted">
                      {amount(t.ethWei, 18, 5)}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-xs text-fg">
                      {amount(t.tokenWei, decimals)}
                    </td>
                    <td className="hidden py-2 pr-4 font-mono text-xs text-fg-dim sm:table-cell">{shortAddr(t.trader)}</td>
                    <td className="hidden py-2 text-right sm:table-cell">
                      <a
                        href={explorerTx(t.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-acid-500 underline-offset-4 hover:underline"
                      >
                        {/* The glyph was the whole accessible name: a screen
                            reader listing this table's links read "north east
                            arrow" thirty times with nothing to tell them apart.
                            The hash is what distinguishes one from the next. */}
                        <span aria-hidden>↗</span>
                        <span className="sr-only">Transaction {shortAddr(t.txHash)} on the explorer</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-fg-dim">
            Read directly from the pool's own swap events — the same record every other tool
            reads. The most recent fills only: the node refuses a query that would match more
            than ten thousand, so the window narrows as a pool gets busier.
          </p>
        </>
      )}
    </section>
  )
}
