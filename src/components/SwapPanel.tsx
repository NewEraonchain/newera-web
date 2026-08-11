import { useCallback, useEffect, useRef, useState } from "react"
import { formatUnits } from "viem"
import { explorerTx } from "@/lib/chain"
import { FEE_BIPS, feeIsOn, getDecimals, needsApproval, quoteTrade, type Pool, type Quote, type Side } from "@/lib/swap"
import { executeTrade, getEthBalance, getTokenBalance, type TradeState } from "@/lib/trade"
import { connectedAddress, onAccountsChanged } from "@/lib/wallet"

/* Trading, in our interface, against Uniswap's routers.
 *
 * The interface is ours; the execution is Uniswap's and the custody is the
 * user's. NewEra deploys no contract, so there is no contract of ours to audit
 * — but this file drives the construction of calldata a person signs, which
 * makes it the security-critical surface in its place. Two rules follow:
 *
 *   1. Never present a number we did not get from the chain. Quotes are live
 *      reads from QuoterV2 or the v4 quoter, impact is measured in the same pool
 *      and direction, and the amount reported afterwards is the actual balance
 *      change, not the quote we predicted.
 *   2. Never let a swap out without a floor under it. minOut is computed in
 *      swap.ts, enforced by the router, and the builders throw rather than
 *      encode a zero.
 *
 * Buying needs no approval — ETH goes in as msg.value. Selling needs two
 * one-time Permit2 grants per token before the first sell, which is why the
 * action below can become a short sequence rather than a single button. */

const SLIPPAGE_CHOICES = [0.5, 1, 3, 5]
const BUY_PRESETS = ["0.01", "0.05", "0.1", "0.5"]
const SELL_FRACTIONS: Array<[string, number]> = [["25%", 0.25], ["50%", 0.5], ["Max", 1]]

/* These pools are thin — a $4.2k pool moves 3.5% on 0.05 ETH — so warn early. */
const IMPACT_WARN = 0.03
const IMPACT_SEVERE = 0.1

/* How long a quote is allowed to stand.
 *
 * A quote is a read of a pool at one moment, and in a $4k pool a single trade
 * by somebody else moves it by percent. There was nothing at all stopping a
 * quote from being signed an hour after it was priced — the minimum would then
 * catch it and the swap would revert, which costs gas and reads as our fault.
 * Thirty seconds is roughly ten blocks here. */
const QUOTE_TTL_MS = 30_000

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
  const [side, setSide] = useState<Side>("buy")
  const [amount, setAmount] = useState("0.05")
  const [slippage, setSlippage] = useState(1)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [noFill, setNoFill] = useState(false)
  const [state, setState] = useState<TradeState>({ phase: "idle" })
  const [ethBalance, setEthBalance] = useState<bigint | null>(null)
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null)
  /* null until the token answers, never a guess.
   *
   * This was `useState(18)` and was only corrected once a quote came back. The
   * Max button divides the raw balance by 10^decimals, and the sell tab opens
   * with an empty amount — so there is no quote, and on a 6-decimal token Max
   * offered a millionth of what the user actually held. Reading it from the
   * token itself on mount costs one call and removes the guess entirely. */
  const [decimals, setDecimals] = useState<number | null>(null)
  const [ack, setAck] = useState(false)
  /* When the number on screen was priced. A quote is a read of a pool at a
     moment; pools on this chain move on almost every block, and there was
     nothing stopping someone leaving the tab open for an hour and then signing
     against a price from an hour ago. */
  const [quotedAt, setQuotedAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  /* The account the wallet is ON, not the one that signed in. Those diverge the
     moment somebody switches accounts in MetaMask, and every balance here — and
     therefore the Max button — was reading the stale one while the trade would
     have executed from the live one. */
  const [address, setAddress] = useState<string | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    let alive = true
    connectedAddress().then((a) => alive && setAddress(a))
    const off = onAccountsChanged((a) => alive && setAddress(a))
    return () => {
      alive = false
      off()
    }
  }, [])

  useEffect(() => {
    let alive = true
    getDecimals(token)
      .then((d) => alive && setDecimals(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [token])

  useEffect(() => {
    if (!address) return
    getEthBalance(address).then(setEthBalance).catch(() => setEthBalance(null))
    getTokenBalance(token, address).then(setTokenBalance).catch(() => setTokenBalance(null))
  }, [address, token, state.phase])

  /* Ticks only while a quote is on screen, so an idle tab is not re-rendering
     once a second forever. */
  useEffect(() => {
    if (!quote) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [quote])

  // Switching side changes what the amount means, so it cannot carry over.
  const swapSide = useCallback((next: Side) => {
    setSide(next)
    setQuote(null)
    setAck(false)
    setState({ phase: "idle" })
    setAmount(next === "buy" ? "0.05" : "")
  }, [])

  /* Re-quote on every change, debounced. Each request carries a sequence number
     so a slow early response cannot overwrite a fast later one — quoting probes
     several fee tiers and response times differ by seconds. */
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const n = ++seq.current
    const parsed = Number(amount)
    if (!amount || !isFinite(parsed) || parsed <= 0) {
      setQuote(null)
      setQuoting(false)
      setNoFill(false)
      return
    }
    setQuoting(true)
    const t = setTimeout(async () => {
      try {
        const q = await quoteTrade({
          pool,
          token,
          amount,
          side,
          slippagePct: slippage,
          tokenDecimals: decimals ?? undefined,
        })
        if (seq.current !== n) return
        setQuote(q)
        setQuotedAt(Date.now())
        setNow(Date.now())
        setNoFill(q === null)
        if (q) setDecimals(side === "buy" ? q.outDecimals : q.inDecimals)
      } catch {
        if (seq.current === n) setQuote(null)
      } finally {
        if (seq.current === n) setQuoting(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [pool, token, amount, side, slippage, decimals, refresh])

  const run = useCallback(
    (kind: "metamask" | "walletconnect") => {
      if (!quote) return
      executeTrade({ kind, token, pool, quote }, setState)
    },
    [quote, token, pool]
  )

  const age = quote ? now - quotedAt : 0
  const stale = !!quote && age > QUOTE_TTL_MS
  const impact = quote?.priceImpact ?? 0
  const severe = impact >= IMPACT_SEVERE
  const busy = state.phase !== "idle" && state.phase !== "error" && state.phase !== "done"
  const outSymbol = side === "buy" ? symbol || "tokens" : "ETH"
  const inSymbol = side === "buy" ? "ETH" : symbol || "tokens"

  if (!pool.supported) {
    return (
      /* `status`, because this replaces a panel that was still deciding. The
         routing probe takes a second or two of RPC calls, and the verdict —
         you cannot trade this here — arrived as a silent DOM swap. */
      <section role="status" className="border border-edge p-6">
        {/* The heading has to match the reason under it. "Trading this one
            happens elsewhere" is true when the market is on a venue we do not
            route; it is false when the pool is empty, where trading is not
            happening anywhere. */}
        <h2 className="text-lg font-semibold text-fg">
          {pool.venueTradeable === false
            ? "This one cannot be traded right now"
            : "Trading this one happens elsewhere"}
        </h2>
        <p className="measure mt-3 text-sm leading-relaxed text-fg-muted">
          {pool.reason ||
            "NewEra cannot route this market, so we hand you over to the venue rather than guess at a route."}
        </p>
        {venueUrl &&
          (pool.venueTradeable === false ? (
            /* Not an offer to trade. When the pool is empty or will not quote,
               "Trade on Uniswap" sat directly under our own sentence saying
               nothing can be traded at any size — pointing somebody at the same
               wall with less explanation. The link stays, because seeing the
               pool for yourself is the reasonable next step; the verb goes. */
            <a
              href={venueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="scan-link mt-5 inline-block text-sm text-fg-muted"
            >
              See the pool on {venueName || "the venue"} ↗
            </a>
          ) : (
            <a
              href={venueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block-btn mt-5 inline-block bg-acid-500 font-semibold text-ink-950"
            >
              Trade on {venueName || "the venue"} ↗
            </a>
          ))}
      </section>
    )
  }

  const balance = side === "buy" ? ethBalance : tokenBalance
  const balanceDecimals = side === "buy" ? 18 : decimals

  return (
    <section className="border border-edge">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-6 py-4">
        <div className="flex" role="group" aria-label="Trade direction">
          {(["buy", "sell"] as Side[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={side === s}
              onClick={() => swapSide(s)}
              className={`border px-5 py-1.5 text-sm font-semibold transition-colors ${
                side === s
                  ? "border-acid-500 text-acid-500"
                  : "border-edge text-fg-dim hover:text-fg"
              } ${s === "sell" ? "-ml-px" : ""}`}
            >
              {s === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>
        <span className="font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
          {pool.protocol === "v4"
            ? `Uniswap v4${pool.key?.hooks && !/^0x0+$/.test(pool.key.hooks) ? " · hooked pool" : ""}`
            : `Uniswap v3${pool.fee !== undefined ? ` · ${(pool.fee / 10000).toFixed(2)}% fee` : ""}`}
        </span>
      </div>

      <div className="p-6">
        <label htmlFor="swap-amount" className="block font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
          You pay ({inSymbol})
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input
            id="swap-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            /* 16px minimum or iOS Safari zooms the viewport on focus. */
            className="w-48 border border-edge bg-transparent px-3 py-2 font-mono text-base text-fg outline-none focus-visible:border-acid-500"
          />
          <div className="flex flex-wrap gap-2">
            {side === "buy"
              ? BUY_PRESETS.map((p) => (
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
                ))
              : SELL_FRACTIONS.map(([label, f]) => (
                  <button
                    key={label}
                    type="button"
                    disabled={!tokenBalance || decimals === null}
                    onClick={() => {
                      if (!tokenBalance || decimals === null) return
                      /* Take the fraction in base units so "Max" is the exact
                         balance — formatting first and re-parsing loses the
                         tail and leaves dust behind. */
                      const part = f === 1 ? tokenBalance : (tokenBalance * BigInt(Math.round(f * 1000))) / 1000n
                      setAmount(formatUnits(part, decimals))
                    }}
                    className="border border-edge px-2.5 py-1.5 font-mono text-xs text-fg-dim transition-colors hover:text-fg disabled:opacity-40"
                  >
                    {label}
                  </button>
                ))}
          </div>
        </div>
        {balance !== null && balanceDecimals !== null && (
          <p className="mt-2 font-mono text-xs text-fg-dim">
            You hold {Number(formatUnits(balance, balanceDecimals)).toLocaleString("en-US", { maximumFractionDigits: side === "buy" ? 4 : 2 })}{" "}
            {inSymbol}
          </p>
        )}
        {side === "sell" && tokenBalance === 0n && (
          <p className="mt-2 text-sm text-fg-muted">You do not hold any {symbol} to sell.</p>
        )}

        <div className="mt-6 border-t border-edge pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
              You receive (estimated)
            </span>
            <span className="font-mono text-micro text-fg-dim">
              <span id="slippage-label">max slippage</span>
              {/* A labelled group, and each button says whether it is the one
                  in force. Three unlabelled buttons reading "1% 2% 5%" in a row
                  tell a screen reader nothing about what they set or which is
                  selected — and the selection is the difference between a trade
                  that fills and one that reverts.

                  py-1.5, not py-0.5: these measured 31x21 on a phone, under the
                  24px floor, and they sit directly above the button that spends
                  the money. `-my-1` keeps the row's height where it was. */}
              <span
                role="group"
                aria-labelledby="slippage-label"
                className="ml-2 -my-1 inline-flex gap-1"
              >
                {SLIPPAGE_CHOICES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={slippage === s}
                    onClick={() => setSlippage(s)}
                    className={`border px-2.5 py-1.5 transition-colors ${
                      slippage === s ? "border-acid-500 text-acid-500" : "border-edge hover:text-fg"
                    }`}
                  >
                    {s}%
                  </button>
                ))}
              </span>
            </span>
          </div>

          {/* aria-live on the figure itself. The quote arrives from an RPC call
              a second or two after the amount is typed and replaces this number
              in place; without it, a reader who cannot see the change has no way
              to know the estimate landed, let alone what it says. `polite` and
              on the figure only — the whole panel as a live region would re-read
              itself on every keystroke. */}
          <p className="mt-3 font-mono text-2xl font-medium text-fg" aria-live="polite">
            {quoting && !quote
              ? "…"
              : quote
                ? `${Number(quote.receive).toLocaleString("en-US", { maximumFractionDigits: side === "buy" ? 4 : 6 })} ${outSymbol}`
                : "—"}
          </p>

          {quote && (
            <dl className="mt-4 flex flex-col gap-2 text-xs">
              <div className="flex justify-between gap-4">
                {/* "Enforced by the router", not "guaranteed". The router does
                    enforce this figure on the swap's OUTPUT — but a token that
                    takes a fee on transfer skims its cut on the way to the
                    wallet, after the check has passed. On this chain those
                    exist. The number is honest about what enforces it; the
                    balance read after the swap is what actually arrived, and
                    that is the figure reported at the end. */}
                <dt className="text-fg-dim">Minimum the router will accept</dt>
                <dd className="font-mono text-fg-muted">
                  {Number(quote.minReceive).toLocaleString("en-US", { maximumFractionDigits: side === "buy" ? 4 : 6 })}{" "}
                  {outSymbol}
                </dd>
              </div>
              {feeIsOn() && (
                /* Stated, always, in the unit it is charged in. A fee a reader
                   has to infer from a worse-than-expected output is the same
                   fee charged dishonestly — and on a buy it is already out of
                   the amount they typed, so the figure above would not show it
                   at all. */
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-dim">
                    NewEra fee ({(FEE_BIPS / 100).toFixed(2).replace(/\.?0+$/, "")}%)
                  </dt>
                  <dd className="font-mono text-fg-muted">
                    {Number(formatUnits(quote.feeWei, 18)).toLocaleString("en-US", {
                      maximumFractionDigits: 6,
                    })}{" "}
                    ETH
                  </dd>
                </div>
              )}
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

          {noFill && !quoting && (
            <p className="mt-3 text-sm text-warn">
              This pool cannot fill a trade that size right now. Try less.
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
              This pool is too thin to absorb {amount} {inSymbol} at the quoted rate, so you get
              meaningfully less than the headline price suggests
              {side === "buy" ? " — and selling back would cost you again." : "."}
            </p>
            {severe && (
              <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-fg-muted">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-[3px] h-4 w-4 flex-none accent-[var(--acid-500,#c8ff00)]"
                />
                <span>I understand I am losing {(impact * 100).toFixed(1)}% to price impact.</span>
              </label>
            )}
          </div>
        )}

        {stale && (
          <p className="measure mt-4 border-l-2 border-warn pl-4 text-sm leading-relaxed text-fg-muted">
            This price is {Math.round(age / 1000)} seconds old. Pools this thin move on almost
            every block, so it is re-read before you can send.{" "}
            <button
              type="button"
              onClick={() => setRefresh((r) => r + 1)}
              className="scan-link text-acid-500"
            >
              Re-price it now
            </button>
          </p>
        )}

        <Action
          state={state}
          busy={busy}
          disabled={!quote || quoting || stale || (severe && !ack)}
          outSymbol={outSymbol}
          side={side}
          approvalsLikely={needsApproval(pool, token, side)}
          onGo={run}
          onReset={() => setState({ phase: "idle" })}
        />

        <p className="measure mt-5 text-xs leading-relaxed text-fg-dim">
          The swap runs on <b className="font-semibold text-fg-muted">Uniswap's router</b>, signed
          by your wallet.{" "}
          <b className="font-semibold text-fg-muted">
            NewEra never holds your funds and cannot move them
          </b>{" "}
          — the proceeds go straight to your address, and we take no fee or spread. Quotes come
          from the pool and change between blocks. This is not advice, and nothing here says this
          token is worth buying or selling.
        </p>
      </div>
    </section>
  )
}

function Action({
  state,
  busy,
  disabled,
  outSymbol,
  side,
  approvalsLikely,
  onGo,
  onReset,
}: {
  state: TradeState
  busy: boolean
  disabled: boolean
  outSymbol: string
  side: Side
  approvalsLikely: boolean
  onGo: (k: "metamask" | "walletconnect") => void
  onReset: () => void
}) {
  const label: Record<string, string> = {
    connecting: "Check your wallet…",
    switching: "Confirm the network switch…",
    checking: "Checking approvals…",
    approving: "Approving…",
    signing: "Confirm in your wallet…",
    pending: "Swapping…",
  }

  if (state.phase === "done") {
    return (
      /* Announced. Everything on this page below the button is rendered into
         static markup: a swap that failed, a swap that succeeded and a swap
         waiting on a wallet prompt all changed the page silently, so a screen
         reader user pressed Buy and was told nothing at all — on the one screen
         where the outcome is somebody's money. */
      <div role="status" className="mt-6 border-l-2 border-acid-500 pl-4">
        <p className="text-base font-semibold text-fg">
          {state.received
            ? `Received ${Number(state.received).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${outSymbol}.`
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
            Trade again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6">
      {/* The running commentary, for a reader who cannot see the button change
          its own label. `polite` so it waits for a gap rather than cutting
          across what the wallet extension is saying. The error takes `alert`
          instead — it interrupts, because it means the attempt is over. */}
      <p className="sr-only" aria-live="polite">
        {busy ? label[state.phase] || "Working…" : ""}
      </p>
      {state.phase === "error" && (
        <p
          role="alert"
          className="measure mb-4 border-l-2 border-danger pl-4 text-sm leading-relaxed text-fg-muted"
        >
          {state.message}
        </p>
      )}
      {/* Say the approvals are coming BEFORE the wallet asks. An unexplained
          second prompt after "Sell" reads like something has gone wrong. */}
      {approvalsLikely && !busy && state.phase !== "error" && (
        <p className="measure mb-4 text-xs leading-relaxed text-fg-dim">
          The first {side} of this token needs up to two one-time approvals before the swap, so
          your wallet may ask more than once. They are per-token and do not repeat.
        </p>
      )}
      {state.phase === "approving" && state.label && (
        <p className="measure mb-4 text-xs leading-relaxed text-fg-muted">
          Step {state.step} of {state.total}: {state.label}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => onGo("metamask")}
          className="block-btn bg-acid-500 font-semibold text-ink-950 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? label[state.phase] || "Working…" : side === "buy" ? "Buy" : "Sell"}
        </button>
        {!busy && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onGo("walletconnect")}
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
