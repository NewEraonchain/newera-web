import { useCallback, useEffect, useRef, useState } from "react"
import { formatUnits } from "viem"
import { explorerTx } from "@/lib/chain"
import { quoteBuy, type Pool, type Quote } from "@/lib/swap"
import { executeBuy, getEthBalance, type TradeState } from "@/lib/trade"
import { currentAddress } from "@/lib/wallet"

/* Buying, in our interface, against Uniswap's router.
 *
 * The interface is ours; the execution is Uniswap's and the custody is the
 * user's. NewEra deploys no contract, so there is no contract of ours to audit
 * — but this file constructs the calldata a person signs, which makes it the
 * security-critical surface in its place. Two rules follow from that:
 *
 *   1. Never present a number we did not get from the chain. The quote is a
 *      live QuoterV2 read, the impact is measured in the same pool, and the
 *      amount reported after the trade is the actual balance change, not the
 *      quote we predicted.
 *   2. Never let a swap go out without a floor under it. minOut is computed in
 *      swap.ts, enforced by the router, and buildBuy throws rather than encode
 *      a zero.
 *
 * Only Uniswap v3 is routed here. v4 and flapsh markets fall through to the
 * external handoff, because a wrong route is worse than an honest one. */

const SLIPPAGE_CHOICES = [0.5, 1, 3, 5]
const PRESETS = ["0.01", "0.05", "0.1", "0.5"]

/* These pools are thin — the median is around $7k, and a $1,800 buy in the
   deepest one measured moved the price 11.8%. Warn early and loudly. */
const IMPACT_WARN = 0.03
const IMPACT_SEVERE = 0.1

export default function SwapPanel({
  token,
  symbol,
  pool,
  venueUrl,
  venueName,
}: {
  token: string
  symbol: string
  pool: Pool
  venueUrl?: string | null
  venueName?: string | null
}) {
  const [amount, setAmount] = useState("0.05")
  const [slippage, setSlippage] = useState(1)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [noPool, setNoPool] = useState(false)
  const [state, setState] = useState<TradeState>({ phase: "idle" })
  const [balance, setBalance] = useState<bigint | null>(null)
  const [ack, setAck] = useState(false)

  const address = currentAddress()
  const seq = useRef(0)

  useEffect(() => {
    if (!address) return
    getEthBalance(address).then(setBalance).catch(() => setBalance(null))
  }, [address, state.phase])

  /* Re-quote on every input change, debounced. Each request carries a sequence
     number so a slow early response cannot overwrite a fast later one — with
     four fee tiers probed in order, response times differ by seconds. */
  useEffect(() => {
    const n = ++seq.current
    const parsed = Number(amount)
    if (!amount || !isFinite(parsed) || parsed <= 0) {
      setQuote(null)
      setQuoting(false)
      return
    }
    setQuoting(true)
    const t = setTimeout(async () => {
      try {
        const q = await quoteBuy(token, amount, slippage, { fee: pool.fee })
        if (seq.current !== n) return
        setQuote(q)
        setNoPool(q === null)
      } catch {
        if (seq.current === n) setQuote(null)
      } finally {
        if (seq.current === n) setQuoting(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [token, amount, slippage, pool.fee])

  const run = useCallback(
    (kind: "metamask" | "walletconnect") => {
      if (!quote) return
      executeBuy({ kind, token, quote, decimals: quote.decimals }, setState)
    },
    [quote, token]
  )

  const impact = quote?.priceImpact ?? 0
  const severe = impact >= IMPACT_SEVERE
  const needsAck = severe && !ack
  const busy = state.phase !== "idle" && state.phase !== "error" && state.phase !== "done"

  if (!pool.supported) {
    return (
      <section className="mt-[6vh] border border-edge p-6">
        <h2 className="text-lg font-semibold text-fg">Trading this one happens elsewhere</h2>
        <p className="measure mt-3 text-sm leading-relaxed text-fg-muted">
          This market is on{" "}
          <b className="font-mono text-fg">
            {pool.protocol === "flapsh" ? "flapsh" : pool.protocol === "v4" ? "Uniswap v4" : "a venue"}
          </b>
          , which NewEra does not route yet. Rather than guess at a route and risk sending your
          funds through the wrong pool, we hand you over to the venue itself.
        </p>
        {venueUrl && (
          <a
            href={venueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block-btn mt-5 inline-block bg-acid-500 font-semibold text-ink-950"
          >
            Trade on {venueName || "the venue"} ↗
          </a>
        )}
      </section>
    )
  }

  return (
    <section className="mt-[6vh] border border-edge">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-edge px-6 py-4">
        <h2 className="text-lg font-semibold text-fg">Buy {symbol || "this token"}</h2>
        <span className="font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
          Uniswap v3 · {pool.fee ? `${(pool.fee / 10000).toFixed(2)}% fee` : "—"}
        </span>
      </div>

      <div className="p-6">
        <label htmlFor="swap-amount" className="block font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
          You pay (ETH)
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input
            id="swap-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            autoComplete="off"
            /* 16px minimum or iOS Safari zooms the viewport on focus. */
            className="w-40 border border-edge bg-transparent px-3 py-2 font-mono text-base text-fg outline-none focus-visible:border-acid-500"
          />
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAmount(p)}
                className={`border px-2.5 py-1.5 font-mono text-xs transition-colors ${
                  amount === p ? "border-acid-500 text-acid-500" : "border-edge text-fg-dim hover:text-fg"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        {balance !== null && (
          <p className="mt-2 font-mono text-xs text-fg-dim">
            Wallet balance {Number(formatUnits(balance, 18)).toFixed(4)} ETH
          </p>
        )}

        <div className="mt-6 border-t border-edge pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
              You receive (estimated)
            </span>
            <span className="font-mono text-micro text-fg-dim">
              max slippage
              <span className="ml-2 inline-flex gap-1">
                {SLIPPAGE_CHOICES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSlippage(s)}
                    className={`border px-2 py-0.5 transition-colors ${
                      slippage === s ? "border-acid-500 text-acid-500" : "border-edge hover:text-fg"
                    }`}
                  >
                    {s}%
                  </button>
                ))}
              </span>
            </span>
          </div>

          <p className="mt-3 font-mono text-2xl font-medium text-fg">
            {quoting && !quote
              ? "…"
              : quote
                ? `${Number(quote.amountOut).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${symbol}`
                : noPool
                  ? "—"
                  : "—"}
          </p>

          {quote && (
            <dl className="mt-4 flex flex-col gap-2 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-fg-dim">Guaranteed minimum</dt>
                <dd className="font-mono text-fg-muted">
                  {Number(quote.minOut).toLocaleString("en-US", { maximumFractionDigits: 4 })} {symbol}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-dim">Price impact</dt>
                <dd
                  className={`font-mono ${severe ? "text-danger" : impact >= IMPACT_WARN ? "text-warn" : "text-fg-muted"}`}
                >
                  {impact < 0.0001 ? "<0.01%" : `${(impact * 100).toFixed(2)}%`}
                </dd>
              </div>
            </dl>
          )}

          {noPool && !quoting && (
            <p className="mt-3 text-sm text-warn">
              No v3 pool answered a quote at this size. The pool may be too thin to fill it — try
              less.
            </p>
          )}
        </div>

        {/* The single most useful warning on the page. These pools are small
            enough that ordinary-looking sizes move the price double digits, and
            that cost is invisible until it has already been paid. */}
        {quote && impact >= IMPACT_WARN && (
          <div className={`mt-5 border-l-2 pl-4 ${severe ? "border-danger" : "border-warn"}`}>
            <p className="measure text-sm leading-relaxed text-fg-muted">
              <b className={`font-semibold ${severe ? "text-danger" : "text-warn"}`}>
                This trade moves the price {(impact * 100).toFixed(1)}%.
              </b>{" "}
              This pool is too thin to absorb {amount} ETH at the quoted rate, so you pay
              meaningfully worse than the headline price — and selling back would cost you again.
            </p>
            {severe && (
              <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-fg-muted">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-[3px] h-4 w-4 flex-none accent-[var(--acid-500,#c8ff00)]"
                />
                <span>I understand I am paying {(impact * 100).toFixed(1)}% above the market price.</span>
              </label>
            )}
          </div>
        )}

        <Action
          state={state}
          busy={busy}
          disabled={!quote || quoting || needsAck}
          symbol={symbol}
          onBuy={run}
          onReset={() => setState({ phase: "idle" })}
        />

        <p className="measure mt-5 text-xs leading-relaxed text-fg-dim">
          The swap runs on <b className="font-semibold text-fg-muted">Uniswap's router</b>, signed
          by your wallet.{" "}
          <b className="font-semibold text-fg-muted">
            NewEra never holds your funds and cannot move them
          </b>
          {" "}— the tokens go straight to your address. Quotes come from the pool and change
          between blocks. This is not advice, and nothing here says this token is a good buy.
        </p>
      </div>
    </section>
  )
}

function Action({
  state,
  busy,
  disabled,
  symbol,
  onBuy,
  onReset,
}: {
  state: TradeState
  busy: boolean
  disabled: boolean
  symbol: string
  onBuy: (k: "metamask" | "walletconnect") => void
  onReset: () => void
}) {
  const label: Record<string, string> = {
    connecting: "Check your wallet…",
    switching: "Confirm the network switch…",
    signing: "Confirm in your wallet…",
    pending: "Swapping…",
  }

  if (state.phase === "done") {
    return (
      <div className="mt-6 border-l-2 border-acid-500 pl-4">
        <p className="text-base font-semibold text-fg">
          {state.received
            ? `Bought ${Number(state.received).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${symbol}.`
            : "Swap confirmed."}
        </p>
        <p className="mt-1 text-xs text-fg-dim">
          {state.received
            ? "This is the actual change in your balance, not the estimate."
            : "The transaction succeeded but the balance change could not be read."}
        </p>
        <div className="mt-3 flex flex-wrap gap-5">
          <a href={explorerTx(state.hash)} target="_blank" rel="noopener noreferrer" className="scan-link text-xs text-acid-500">
            View transaction ↗
          </a>
          <button type="button" onClick={onReset} className="text-xs text-fg-dim hover:text-fg">
            Buy more
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6">
      {state.phase === "error" && (
        <p className="measure mb-4 border-l-2 border-danger pl-4 text-sm leading-relaxed text-fg-muted">
          {state.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => onBuy("metamask")}
          className="block-btn bg-acid-500 font-semibold text-ink-950 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? label[state.phase] || "Working…" : "Buy"}
        </button>
        {!busy && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onBuy("walletconnect")}
            className="py-2 text-sm text-fg-dim underline-offset-4 hover:text-fg hover:underline disabled:opacity-40"
          >
            Use WalletConnect
          </button>
        )}
      </div>
      {state.phase === "pending" && (
        <a
          href={explorerTx(state.hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="scan-link mt-3 inline-block text-xs text-acid-500"
        >
          Track it on the explorer ↗
        </a>
      )}
    </div>
  )
}
