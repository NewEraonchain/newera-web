import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { getJSON, shortAddr } from "@/lib/api"
import type { Launch } from "@/lib/api"
import { currentAddress, connectForTrading, isRejection } from "@/lib/wallet"
import { loadBalances, loadPortfolio, unrealisedEth, type Position, type PortfolioResult } from "@/lib/portfolio"
import { useMarkets } from "@/lib/markets"
import { Page, SectionHead } from "@/components/shell"
import { EmptyState, Skeleton, RiskPill, FlagPill } from "@/components/intel"

/* What you are holding, what it cost, and what is wrong with it.
 *
 * The last clause is the reason this page exists rather than being a link to a
 * block explorer. Every terminal can list balances. This one already knows
 * which of those tokens are near-duplicates of something else, how much of the
 * supply the deployer still holds, and whether anyone else is holding at all —
 * so the portfolio can answer "should I still be in this", which is the actual
 * question, instead of "what do I have".
 *
 * Three sources, degrading independently: the explorer for balances and
 * history, DexScreener for the current price, and our own index for the
 * judgement. Any one can be missing without blanking the others — a position
 * with no price still shows its cost, and a position we have never indexed
 * still shows its position.
 */

const fmtEth = (v: number, dp = 4) => `Ξ${v.toFixed(dp)}`
const fmtAmount = (v: number) => {
  if (v === 0) return "0"
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  if (v >= 1) return v.toFixed(2)
  return v.toExponential(1)
}

/* Profit is the one number on this site that gets a colour.
 *
 * Everywhere else acid and danger are OUR verdicts about a token and are kept
 * off anything a venue reported. A gain or a loss is neither — it is the
 * reader's own outcome, it has no other reading, and the sign carries it for
 * anyone who cannot see the hue. */
function Pnl({ eth, dp = 4 }: { eth: number | null; dp?: number }) {
  if (eth === null) return <span className="text-fg-dim">—</span>
  const flat = Math.abs(eth) < 1e-9
  return (
    <span className={flat ? "text-fg-dim" : eth > 0 ? "text-acid-500" : "text-danger"}>
      {eth > 0 ? "+" : ""}
      {fmtEth(eth, dp)}
    </span>
  )
}

export default function Portfolio() {
  const [address, setAddress] = useState<string | null>(() => currentAddress())
  const [data, setData] = useState<PortfolioResult | null>(null)
  /* Holdings arrive in about a second; the cost basis takes thirty. Rendering
     the first while the second runs is the difference between a page and a
     spinner, so they are separate state. */
  const [held, setHeld] = useState<Position[] | null>(null)
  const [pricing, setPricing] = useState(false)
  const [intel, setIntel] = useState<Map<string, Launch>>(new Map())
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    document.title = "Portfolio · NewEra"
  }, [])

  const load = useCallback(async (wallet: string) => {
    setLoading(true)
    setErr(null)

    // What they own, straight away.
    const b = await loadBalances(wallet)
    setLoading(false)
    if (b.failed) {
      setErr("The chain explorer is not answering, so we cannot read this wallet right now.")
      return
    }
    setHeld(b.positions)

    // What it cost, once the walk finishes.
    setPricing(true)
    const r = await loadPortfolio(wallet)
    setPricing(false)
    setData(r)
    if (r.failed) {
      setErr("The chain explorer is not answering, so we cannot read this wallet right now.")
      return
    }
    /* Our own read on what they hold, in one request. Failing here costs the
       judgement column and nothing else, so it does not touch `err`. */
    const addrs = b.positions.map((p) => p.address).slice(0, 100)
    if (!addrs.length) return
    try {
      const j = await getJSON<{ items: Launch[] }>(`/intel/tokens?addresses=${addrs.join(",")}`)
      setIntel(new Map(j.items.map((l) => [l.address.toLowerCase(), l])))
    } catch {
      /* The index is optional here. A portfolio without our verdicts is still a
         portfolio; a portfolio that refuses to render because of it is not. */
    }
  }, [])

  useEffect(() => {
    if (address) load(address)
  }, [address, load])

  const onConnect = async () => {
    try {
      /* connectForTrading, NOT connect. The latter opens a server session
         and creates an account; reading your own holdings should not cost you
         a record on our side, and this page stores nothing either way. */
      const { address: a } = await connectForTrading("metamask")
      if (a) setAddress(a)
    } catch (e) {
      if (!isRejection(e)) setErr("Could not connect that wallet.")
    }
  }

  /* Live prices for exactly what is held. `useMarkets` already batches and
     already refuses to report a failed lookup as an empty market. */
  const markets = useMarkets(
    useMemo(() => (data?.positions || []).map((p) => p.address), [data])
  )

  const rows = useMemo(() => {
    /* The reconstruction when it is ready, the plain balances until then. Both
       are the same shape; the difference is that the early one has no cost, and
       every cost figure is null rather than zero so nothing reads as free. */
    const source = data?.positions ?? held
    if (!source) return []
    return source.map((p) => {
      const m = markets?.markets.get(p.address)
      const priceEth = m?.priceNative ?? null
      const valueEth = priceEth === null ? null : priceEth * p.amount
      return {
        p,
        priceEth,
        valueEth,
        unrealised: unrealisedEth(p, priceEth),
        launch: intel.get(p.address) || null,
      }
    })
  }, [data, held, markets, intel])

  const totals = useMemo(() => {
    let value = 0
    let realised = 0
    let unrealised = 0
    let valued = 0
    for (const r of rows) {
      /* Zero until the walk has run, and the strip shows a dash for it rather
         than the sum — before reconstruction, realised profit is unknown, and
         a confident 0 is the one wrong answer. */
      realised += data ? r.p.realisedEth : 0
      if (r.valueEth !== null) {
        value += r.valueEth
        valued++
      }
      if (r.unrealised !== null) unrealised += r.unrealised
    }
    return { value, realised, unrealised, valued }
  }, [rows])

  if (!address) {
    return (
      <Page>
        <h1 className="font-display text-[clamp(1.25rem,2.6vw,2.1rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.02em]">
          Portfolio
        </h1>
        <p className="measure mt-4 text-base leading-relaxed text-fg-muted">
          Connect a wallet and this reads its positions straight off the chain — what you hold, what
          you paid, and what our index says about each one.
        </p>
        <p className="measure mt-3 text-sm leading-relaxed text-fg-dim">
          Nothing is sent anywhere. The address is read in your browser against the public explorer,
          and NewEra stores none of it.
        </p>
        <button type="button" onClick={onConnect} className="block-btn mt-6 border border-edge-strong text-fg">
          Connect wallet
        </button>
        {err && <p className="mt-4 text-sm text-warn">{err}</p>}
      </Page>
    )
  }

  return (
    <Page>
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
        <h1 className="font-display text-[clamp(1.25rem,2.6vw,2.1rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.02em]">
          Portfolio
        </h1>
        <span className="font-mono text-micro uppercase tracking-[0.14em] text-fg-dim">
          {shortAddr(address)}
        </span>
      </div>

      {/* The three figures, on one line, in the unit they were actually earned
          in. No dollar conversion: see the note in lib/portfolio.ts — pricing a
          trade in dollars needs an ETH price history this chain does not have,
          and a converted number would be a guess wearing a currency symbol. */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-2 border-y border-edge py-2.5">
        <span className="flex items-baseline gap-x-2">
          <span className="font-mono text-sm font-medium tabular-nums text-fg">
            {data ? fmtEth(totals.value) : "—"}
          </span>
          <span className="font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">held now</span>
        </span>
        <span className="flex items-baseline gap-x-2">
          <span className="font-mono text-sm font-medium tabular-nums">
            <Pnl eth={data ? totals.unrealised : null} />
          </span>
          <span className="font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">unrealised</span>
        </span>
        <span className="flex items-baseline gap-x-2">
          <span className="font-mono text-sm font-medium tabular-nums">
            <Pnl eth={data ? totals.realised : null} />
          </span>
          <span className="font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">realised</span>
        </span>
        <span className="font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
          {rows.length} positions{data ? ` · ${data.tradesPriced} trades priced` : ""}
        </span>
        {/* Named while it happens, because the cost column is visibly empty for
            half a minute and an unexplained gap reads as a bug. */}
        {pricing && (
          <span className="font-mono text-micro uppercase tracking-[0.12em] text-acid-500">
            reconstructing cost…
          </span>
        )}
      </div>

      {/* Said before the table, not after it.
          The cost basis is an inference from transfers, and it is capped: a
          wallet with more history than we walked, or trades batched into one
          call, produce a cost that is a floor rather than the answer. A reader
          acting on a P&L deserves to know that before they read it. */}
      {/* Only when there IS a reconstruction. A failed read has no history to
          be incomplete, and printing "the most recent 0 priced trades" beside
          an outage message is two explanations of one failure, the second of
          them nonsense. */}
      {data && !data.failed && data.tradesPriced > 0 && !data.historyComplete && (
        <p className="measure mt-3 text-micro leading-relaxed text-warn">
          This wallet has more history than we read. Cost and realised profit cover the most recent
          {" "}{data.tradesPriced} priced trades, so both are a floor rather than a total.
        </p>
      )}
      {data && data.tradesUntraced > 0 && (
        <p className="measure mt-2 text-micro leading-relaxed text-fg-dim">
          {data.tradesUntraced} transaction{data.tradesUntraced === 1 ? "" : "s"} could not be priced —
          tokens that arrived without an ETH leg, or several trades batched into one call. Those are
          counted as held, never as free.
        </p>
      )}

      <section className="mt-[4vh]">
        <SectionHead title="Positions" note={data ? `${rows.length} held` : "…"} />
        <div className="mt-4">
          {err ? (
            <EmptyState>{err}</EmptyState>
          ) : loading || (!data && !held) ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} />)
          ) : rows.length === 0 ? (
            <EmptyState>
              This wallet holds no tokens we can see on this chain. Buy something from the live feed
              and it will appear here.
            </EmptyState>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full table-auto border-collapse">
                <caption className="sr-only">
                  Tokens held by this wallet, with cost, current value and our read on each
                </caption>
                <thead>
                  <tr className="border-b border-edge-strong">
                    <th scope="col" className="whitespace-nowrap px-1.5 py-2 text-left font-mono text-micro font-normal uppercase tracking-[0.1em] text-fg-dim sm:px-2">Token</th>
                    <th scope="col" className="whitespace-nowrap px-1.5 py-2 text-right font-mono text-micro font-normal uppercase tracking-[0.1em] text-fg-dim sm:px-2">Amount</th>
                    <th scope="col" className="hidden whitespace-nowrap px-1.5 py-2 text-right font-mono text-micro font-normal uppercase tracking-[0.1em] text-fg-dim sm:table-cell sm:px-2">Avg cost</th>
                    <th scope="col" className="hidden whitespace-nowrap px-1.5 py-2 text-right font-mono text-micro font-normal uppercase tracking-[0.1em] text-fg-dim md:table-cell md:px-2">Price</th>
                    <th scope="col" className="whitespace-nowrap px-1.5 py-2 text-right font-mono text-micro font-normal uppercase tracking-[0.1em] text-fg-dim sm:px-2">Value</th>
                    <th scope="col" className="whitespace-nowrap px-1.5 py-2 text-right font-mono text-micro font-normal uppercase tracking-[0.1em] text-fg-dim sm:px-2">Unrealised</th>
                    <th scope="col" className="hidden whitespace-nowrap px-1.5 py-2 text-right font-mono text-micro font-normal uppercase tracking-[0.1em] text-fg-dim lg:table-cell lg:px-2">Realised</th>
                    <th scope="col" className="hidden whitespace-nowrap px-1.5 py-2 text-left font-mono text-micro font-normal uppercase tracking-[0.1em] text-fg-dim md:table-cell md:px-2">Our read</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ p, priceEth, valueEth, unrealised, launch }) => (
                    <tr key={p.address} className="scan-tr border-b border-edge">
                      <td className="px-1.5 py-0 sm:px-2">
                        <Link
                          to={`/app/token/${p.address}`}
                          aria-label={`${p.symbol} ${p.name}`.trim() || `Token ${shortAddr(p.address)}`}
                          className="flex min-w-0 items-baseline gap-x-2 py-2"
                        >
                          <span className="font-mono text-xs font-semibold text-fg">{p.symbol}</span>
                          <span className="min-w-0 max-w-[10ch] truncate text-micro text-fg-dim lg:max-w-[22ch]">
                            {p.name}
                          </span>
                          {/* The cost is a floor, and the row says so where the
                              number is, not in a footnote under the table. */}
                          {p.costIncomplete && (
                            <span
                              className="whitespace-nowrap font-mono text-micro text-fg-dim"
                              title="Part of this position arrived without a traceable ETH cost"
                            >
                              partial
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-1.5 py-0 text-right font-mono text-micro tabular-nums text-fg-muted sm:px-2">
                        {fmtAmount(p.amount)}
                      </td>
                      <td className="hidden whitespace-nowrap px-1.5 py-0 text-right font-mono text-micro tabular-nums text-fg-muted sm:table-cell sm:px-2">
                        {p.avgCostEth === null ? <span className="text-fg-dim">—</span> : `Ξ${p.avgCostEth.toExponential(1)}`}
                      </td>
                      <td className="hidden whitespace-nowrap px-1.5 py-0 text-right font-mono text-micro tabular-nums text-fg-muted md:table-cell md:px-2">
                        {priceEth === null ? <span className="text-fg-dim">—</span> : `Ξ${priceEth.toExponential(1)}`}
                      </td>
                      <td className="whitespace-nowrap px-1.5 py-0 text-right font-mono text-micro tabular-nums text-fg sm:px-2">
                        {valueEth === null ? <span className="text-fg-dim">—</span> : fmtEth(valueEth, 5)}
                      </td>
                      <td className="whitespace-nowrap px-1.5 py-0 text-right font-mono text-micro tabular-nums sm:px-2">
                        <Pnl eth={unrealised} dp={5} />
                      </td>
                      <td className="hidden whitespace-nowrap px-1.5 py-0 text-right font-mono text-micro tabular-nums lg:table-cell lg:px-2">
                        {/* Null until the walk has run. Before that nothing is reconstructed,
            so realised profit is UNKNOWN — and rendering the 0 the type
            carries would tell the reader they had taken nothing out when we
            simply had not looked yet. */}
        <Pnl eth={data ? p.realisedEth : null} dp={5} />
                      </td>
                      {/* The column no explorer can render: what our index
                          thinks of the thing they are holding. */}
                      <td className="hidden px-1.5 py-0 md:table-cell md:px-2">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
                          {launch ? (
                            <>
                              <RiskPill score={launch.riskScore} />
                              {(launch.spoofFlags || []).slice(0, 1).map((f) => (
                                <FlagPill key={f} flag={f} />
                              ))}
                              {launch.dupeCount > 0 && (
                                <span className="font-mono text-micro font-semibold text-warn">COPY</span>
                              )}
                              {launch.distribution && launch.distribution.devHoldsPct !== null &&
                                launch.distribution.devHoldsPct >= 20 && (
                                  <span className="whitespace-nowrap font-mono text-micro font-semibold text-danger">
                                    DEV {Math.round(launch.distribution.devHoldsPct)}%
                                  </span>
                                )}
                            </>
                          ) : (
                            /* Not indexed is not a verdict. It usually means the
                               token launched before our watcher existed. */
                            <span className="font-mono text-micro text-fg-dim">not indexed</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="measure mt-6 text-micro leading-relaxed text-fg-dim">
          Everything here is denominated in ETH, because that is what the pools quote and what you
          actually paid. Cost is reconstructed from chain transfers rather than reported by anyone,
          so a trade we could not price is left out of the cost rather than counted as free.
        </p>
      </section>
    </Page>
  )
}
