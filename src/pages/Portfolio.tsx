import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { getJSON, shortAddr } from "@/lib/api"
import type { Launch } from "@/lib/api"
import { currentAddress, connectForTrading, isRejection } from "@/lib/wallet"
import { readWatchlist, watch, unwatch, isAddress, type Watched } from "@/lib/watchlist"
import {
  loadBalances,
  loadPortfolio,
  unrealisedEth,
  type Position,
  type PositionTrade,
  type PortfolioResult,
} from "@/lib/portfolio"
import { useMarkets } from "@/lib/markets"
import { Page, SectionHead } from "@/components/shell"
import { EmptyState, Skeleton, RiskPill, FlagPill, EXPLORER } from "@/components/intel"
import { TokenMark } from "@/components/LaunchTable"

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

const fmtEth = (v: number, dp = 4) => {
  if (v === 0) return "Ξ0"
  const sign = v < 0 ? "-" : ""
  const a = Math.abs(v)
  /* Below the last displayed decimal, `toFixed` returns a row of zeroes — so a
     position worth a hundredth of what the column can show reads as worth
     nothing at all. Small numbers are the normal case on this chain. */
  return a < 10 ** -dp ? `${sign}Ξ${a.toExponential(1)}` : `${sign}Ξ${a.toFixed(dp)}`
}

/* The four headline figures get more decimals rather than an exponent.
 * `Ξ8.9e-5` is correct and unreadable, and this is the line somebody reads
 * first. In a column, where the exponent keeps the width even, it stays. */
const fmtTotal = (v: number) => fmtEth(v, Math.abs(v) < 0.001 ? 6 : 4)

const fmtAmount = (v: number) => {
  if (v === 0) return "0"
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  if (v >= 1) return v.toFixed(2)
  return v.toExponential(1)
}

/* Falls back to the transaction rather than to a dash: the row links to the
   explorer, so the hash is the one label that is always true and always
   useful. A dash would say the movement had no time, which is never the case. */
const fmtWhen = (iso: string, tx: string) => {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return `${tx.slice(0, 6)}…`
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

/* Below this a position is not a position, it is a receipt.
 *
 * Measured on a real wallet: 27 rows, of which 15 had no market at all and 8
 * more were worth less than a thousandth of an ETH — dust from mints, airdrops
 * and exits that left a remainder. Ranked among the holdings by nothing in
 * particular, they buried the four positions the reader actually came to look
 * at. They are still counted in every total and still one click away; they
 * simply do not open the page.
 *
 * A position with NO market folds for the same reason a tiny one does: nobody
 * will buy it, so its size is not a holding, it is a number. But only once the
 * market read has actually answered — folding on a price that has not arrived
 * yet would empty the table for a second and fill it again. */
const DUST_ETH = 0.0005

/* Profit is the one number on this site that gets a colour.
 *
 * Everywhere else acid and danger are OUR verdicts about a token and are kept
 * off anything a venue reported. A gain or a loss is neither — it is the
 * reader's own outcome, it has no other reading, and the sign carries it for
 * anyone who cannot see the hue. */
function Pnl({
  eth,
  dp = 4,
  pending,
  total,
}: {
  eth: number | null
  dp?: number
  pending?: boolean
  total?: boolean
}) {
  if (eth === null) return pending ? <Pending /> : <span className="text-fg-dim">—</span>
  const flat = Math.abs(eth) < 1e-9
  return (
    <span className={flat ? "text-fg-dim" : eth > 0 ? "text-acid-500" : "text-danger"}>
      {eth > 0 ? "+" : ""}
      {total ? fmtTotal(eth) : fmtEth(eth, dp)}
    </span>
  )
}

/* "Being worked out", which is not the same claim as "—". See `.cell-pending`
   in index.css for why the distinction earns its own mark. */
function Pending() {
  return <span className="cell-pending" aria-label="still reconstructing" role="img" />
}

type SortKey = "token" | "amount" | "cost" | "price" | "value" | "unrealised" | "realised"

type Row = {
  p: Position
  priceEth: number | null
  valueEth: number | null
  unrealised: number | null
  launch: Launch | null
}

const KEY_OF: Record<SortKey, (r: Row) => number | string | null> = {
  token: (r) => (r.p.symbol || "").toLowerCase(),
  amount: (r) => r.p.amount,
  cost: (r) => r.p.avgCostEth,
  price: (r) => r.priceEth,
  value: (r) => r.valueEth,
  unrealised: (r) => r.unrealised,
  realised: (r) => r.p.realisedEth,
}

/* Sorted in the BROWSER, unlike the feed's headers, and that difference is
 * deliberate rather than an inconsistency. The feed sorts server-side because
 * it shows a window onto forty thousand rows and ordering the visible page
 * would be a lie about the whole. A portfolio is every row the wallet has;
 * ordering it here orders all of it. */
function sortRows(rows: Row[], key: SortKey): Row[] {
  const at = KEY_OF[key]
  return rows.slice().sort((a, b) => {
    const x = at(a)
    const y = at(b)
    if (typeof x === "string" || typeof y === "string") {
      return String(x ?? "").localeCompare(String(y ?? ""))
    }
    /* Unknown is not zero and must not sort as it. A position whose price has
       not arrived would otherwise land among the worthless ones and read as
       having been judged. */
    if (x === null && y === null) return 0
    if (x === null) return 1
    if (y === null) return -1
    return y - x || (a.p.symbol || "").localeCompare(b.p.symbol || "")
  })
}

const TH_BASE =
  "whitespace-nowrap px-1.5 py-2 font-mono text-micro font-normal uppercase tracking-[0.1em] text-fg-dim sm:px-2"

function Th({
  label,
  short,
  sortKey,
  active,
  onSort,
  className = "",
  align = "right",
}: {
  label: string
  /* A phone has room for the column or for its name, not both: at 390 the
     table ran 31px past its box and the disclosure control — the only way into
     a row's detail — was the part that fell off. The button keeps the full
     label for anyone listening to it. */
  short?: string
  sortKey: SortKey
  active: SortKey
  onSort: (k: SortKey) => void
  className?: string
  align?: "left" | "right"
}) {
  const isActive = active === sortKey
  return (
    <th
      scope="col"
      className={`${TH_BASE} ${align === "right" ? "text-right" : "text-left"} ${className}`}
      aria-sort={isActive ? "descending" : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label.toLowerCase()}`}
        className={`chip inline-flex items-center gap-1 uppercase tracking-[0.1em] hover:text-fg ${
          isActive ? "text-acid-500" : ""
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {short ? (
          <>
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{label}</span>
          </>
        ) : (
          label
        )}
        {isActive && <span aria-hidden="true">↓</span>}
      </button>
    </th>
  )
}

/* One figure of the four, at a size that can be read across a desk. The strip
   this replaced set all of them at label size on one line, which made the
   answer to "how am I doing" the same weight as the word beside it. */
function Figure({
  label,
  children,
  note,
}: {
  label: string
  children: React.ReactNode
  note?: string
}) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-base font-medium tabular-nums leading-none sm:text-lg">
        {children}
      </div>
      <div className="mt-1.5 font-mono text-micro uppercase leading-snug tracking-[0.12em] text-fg-dim">
        {label}
        {note ? <span className="text-fg-dim/70"> · {note}</span> : null}
      </div>
    </div>
  )
}

const KIND_TEXT: Record<PositionTrade["kind"], string> = {
  buy: "BUY",
  sell: "SELL",
  in: "IN",
  out: "OUT",
}

/* The trades behind the average, because a cost basis nobody can check is a
 * cost basis nobody should act on. The reconstruction already holds these; not
 * showing them was the page asking to be trusted on its arithmetic. */
function TradeHistory({ p }: { p: Position }) {
  if (!p.trades.length) {
    return (
      <p className="text-micro leading-relaxed text-fg-dim">
        No movement of this token in the history we read. It was held before that window, so its
        cost is not reconstructed here.
      </p>
    )
  }
  return (
    <ul className="max-h-[13rem] overflow-y-auto">
      {p.trades.map((t) => (
        <li key={`${t.tx}-${t.at}-${t.kind}`}>
          <a
            href={`${EXPLORER}/tx/${t.tx}`}
            target="_blank"
            rel="noreferrer"
            className="scan-row grid grid-cols-[3.2rem_1fr_auto] items-baseline gap-x-3 border-b border-edge py-1.5 pl-2 font-mono text-micro tabular-nums sm:grid-cols-[3.2rem_1fr_7rem_auto]"
          >
            <span
              className={
                t.kind === "buy"
                  ? "text-acid-500"
                  : t.kind === "sell"
                    ? "text-fg"
                    : "text-fg-dim"
              }
            >
              {KIND_TEXT[t.kind]}
            </span>
            <span className="truncate text-fg-muted">
              {fmtAmount(t.amount)} <span className="text-fg-dim">{p.symbol}</span>
            </span>
            <span className="hidden text-right text-fg-muted sm:block">
              {t.eth === null ? (
                <span className="text-fg-dim" title="No ETH leg in this transaction">
                  no ETH leg
                </span>
              ) : (
                fmtEth(t.eth, 5)
              )}
            </span>
            <span className="text-right text-fg-dim">{fmtWhen(t.at, t.tx)}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

const ACTION =
  "chip whitespace-nowrap border border-edge-strong px-3 py-1.5 text-center font-mono text-micro uppercase tracking-[0.1em] hover:border-edge-strong"

/* The wallets this browser knows about, and the way between them.
 *
 * The original ask was "see their holdings, manage them, manage their wallets".
 * Reading one wallet was the first two thirds; this is the last, and it stays
 * inside the same constraint as the rest of the page — the list lives in this
 * browser and never reaches our server. A connected wallet always appears, even
 * when it was never saved, because the one address a reader is certain to want
 * is the one they hold the keys to. */
function WalletBar({
  connected,
  active,
  saved,
  onOpen,
  onToggleSave,
  onAdd,
  onConnect,
  showConnect = true,
}: {
  connected: string | null
  active: string | null
  saved: Watched[]
  onOpen: (address: string | null) => void
  onToggleSave: (address: string) => void
  onAdd: (address: string, label: string) => boolean
  onConnect: () => void
  /* Off where the page already offers connecting in its own words. The first
     version rendered a second "Connect wallet" chip directly under the block
     button that does the same thing, and under a heading — "or read any
     address" — that promises the opposite. */
  showConnect?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")
  const [label, setLabel] = useState("")
  const [bad, setBad] = useState(false)

  const chip = (on: boolean) =>
    `chip whitespace-nowrap border px-2.5 py-1.5 font-mono text-micro uppercase tracking-[0.1em] ${
      on ? "border-acid-500 text-acid-500" : "border-edge text-fg-dim hover:text-fg"
    }`

  const mine = connected?.toLowerCase() || null
  const list = saved.filter((w) => w.address !== mine)

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {connected ? (
        <button
          type="button"
          onClick={() => onOpen(null)}
          className={chip(!active || active === mine)}
        >
          {shortAddr(connected)} <span className="opacity-60">· yours</span>
        </button>
      ) : showConnect ? (
        <button type="button" onClick={onConnect} className={chip(false)}>
          Connect wallet
        </button>
      ) : null}

      {list.map((w) => (
        <span key={w.address} className="inline-flex items-stretch">
          <button
            type="button"
            onClick={() => onOpen(w.address)}
            className={`${chip(active === w.address)} border-r-0`}
          >
            {w.label || shortAddr(w.address)}
          </button>
          {/* Forget sits ON the chip rather than behind a menu: a watchlist you
              cannot prune is one that fills with dead addresses. */}
          <button
            type="button"
            onClick={() => onToggleSave(w.address)}
            aria-label={`Stop watching ${w.label || shortAddr(w.address)}`}
            className={`${chip(active === w.address)} border-l-0 px-2 hover:text-danger`}
          >
            <span aria-hidden="true">×</span>
          </button>
        </span>
      ))}

      {/* The address being read right now, which nobody has saved yet. */}
      {active && active !== mine && !saved.some((w) => w.address === active) && (
        <button type="button" onClick={() => onToggleSave(active)} className={chip(false)}>
          + save {shortAddr(active)}
        </button>
      )}

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (onAdd(draft, label)) {
              setDraft("")
              setLabel("")
              setAdding(false)
              setBad(false)
            } else setBad(true)
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="0x…"
            aria-label="Wallet address to watch"
            aria-invalid={bad}
            className={`w-[22ch] border-b bg-transparent py-1 font-mono text-micro text-fg placeholder:text-fg-dim focus:border-acid-500 ${
              bad ? "border-danger" : "border-edge"
            }`}
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={24}
            placeholder="name (optional)"
            aria-label="A name for this wallet"
            className="w-[16ch] border-b border-edge bg-transparent py-1 font-mono text-micro text-fg placeholder:text-fg-dim focus:border-acid-500"
          />
          <button type="submit" className={chip(false)}>
            Watch it
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={chip(false)}>
          + watch a wallet
        </button>
      )}
    </div>
  )
}

export default function Portfolio() {
  const [params, setParams] = useSearchParams()
  /* A wallet you are WATCHING outranks the one you connected, because it was
     asked for explicitly and by URL — which is also what makes a portfolio
     shareable and what lets somebody read this page before they ever connect. */
  const watched = (params.get("address") || "").trim().toLowerCase()
  const watching = /^0x[a-f0-9]{40}$/.test(watched)
  const [connected, setConnected] = useState<string | null>(() => currentAddress())
  const address = watching ? watched : connected

  const [data, setData] = useState<PortfolioResult | null>(null)
  /* Holdings arrive in about a second; the cost basis takes thirty. Rendering
     the first while the second runs is the difference between a page and a
     spinner, so they are separate state. */
  const [held, setHeld] = useState<Position[] | null>(null)
  const [pricing, setPricing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [intel, setIntel] = useState<Map<string, Launch>>(new Map())
  /* "Not indexed" is a claim about the token. Until the lookup has answered,
     the only true statement is that we have not looked yet. */
  const [intelDone, setIntelDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  /* A failure that costs three columns, kept apart from one that costs the
     page. */
  const [costErr, setCostErr] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>("value")
  /* Null means "nobody has said", which is not the same as closed: a wallet
     whose every position is small would otherwise render as a table with no
     rows and a fold nobody thought to open, and that reads as a failure rather
     than as the finding it is. Derived at render rather than set by an effect —
     an effect fires on intermediate frames, and one of those frames has the
     market read momentarily empty, which opened the group on wallets that had
     no reason to. */
  const [dustPref, setDustPref] = useState<boolean | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [saved, setSaved] = useState<Watched[]>(() => readWatchlist())

  /* Switching wallets is a URL change, not a mode. That keeps one code path
     for "which address is this page about" and leaves every view of it
     shareable — including the one you got to by clicking a chip. */
  const openWallet = useCallback(
    (a: string | null) => {
      if (a && a.toLowerCase() !== connected?.toLowerCase()) setParams({ address: a.toLowerCase() })
      else setParams({})
    },
    [connected, setParams]
  )

  const toggleSave = useCallback((a: string) => {
    setSaved(readWatchlist().some((w) => w.address === a.toLowerCase()) ? unwatch(a) : watch(a))
  }, [])

  const addWatched = useCallback(
    (a: string, label: string) => {
      if (!isAddress(a)) return false
      setSaved(watch(a, label))
      openWallet(a)
      return true
    },
    [openWallet]
  )

  useEffect(() => {
    document.title = "Portfolio · NewEra"
  }, [])

  const load = useCallback(async (wallet: string) => {
    setLoading(true)
    setErr(null)
    setCostErr(null)
    setData(null)
    setHeld(null)
    setIntel(new Map())
    setIntelDone(false)
    setOpen(null)
    setDustPref(null)

    // What they own, straight away.
    const b = await loadBalances(wallet)
    setLoading(false)
    if (b.failed) {
      setErr("The chain explorer is not answering, so we cannot read this wallet right now.")
      return
    }
    setHeld(b.positions)

    /* Our own read on what they hold, in one request — BEFORE the cost walk,
       not after it. It used to run last, which meant the column that is this
       page's reason to exist sat on "not indexed" for the two minutes the
       reconstruction took. That is not a slow column, it is a false one: the
       index knew these tokens the whole time. Failing here costs the judgement
       column and nothing else, so it never touches `err`. */
    const addrs = b.positions.map((p) => p.address).slice(0, 100)
    if (addrs.length) {
      try {
        const j = await getJSON<{ items: Launch[] }>(`/intel/tokens?addresses=${addrs.join(",")}`)
        setIntel(new Map(j.items.map((l) => [l.address.toLowerCase(), l])))
      } catch {
        /* A portfolio without our verdicts is still a portfolio; one that
           refuses to render because of them is not. */
      }
      setIntelDone(true)
    } else setIntelDone(true)

    // What it cost, once the walk finishes.
    setPricing(true)
    setProgress(null)
    const r = await loadPortfolio(wallet, (done, total) => setProgress({ done, total }))
    setPricing(false)
    setProgress(null)
    setData(r)
    /* NOT `err`, which blanks the table.
     *
     * The balances already came back — the reader is looking at a working list
     * of what they hold. Failing to reconstruct the cost is the loss of three
     * columns, and reporting it as "we cannot read this wallet" threw away the
     * eight that had worked. Two different failures, two different sentences. */
    if (r.failed) {
      setCostErr(
        "The explorer stopped answering partway through the history, so cost and profit are missing. Refresh to try again."
      )
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
      if (a) setConnected(a)
    } catch (e) {
      if (!isRejection(e)) setErr("Could not connect that wallet.")
    }
  }

  /* Live prices for exactly what is held. `useMarkets` already batches and
     already refuses to report a failed lookup as an empty market. */
  const markets = useMarkets(
    useMemo(() => (data?.positions ?? held ?? []).map((p) => p.address), [data, held])
  )

  const rows = useMemo(() => {
    /* The reconstruction when it is ready, the plain balances until then. Both
       are the same shape; the difference is that the early one has no cost, and
       every cost figure is null rather than zero so nothing reads as free. */
    /* A FAILED reconstruction carries an empty position list, so reading it
       here replaced a working table with nothing — the balances were fine and
       the page went blank anyway. Fall back to them. */
    const source = data && !data.failed ? data.positions : held
    if (!source) return []
    return source.map((p) => {
      const m = markets?.markets.get(p.address)
      /* priceEth, NOT priceNative: on this chain the deepest pool is often
         quoted in another token, and reading that as ETH invented a Ξ66,744
         balance on a wallet holding Ξ0.02. See the note in lib/markets.ts. */
      const priceEth = m?.priceEth ?? null
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

  /* Split before sorting, so the dust never competes for the top of the table
     under any ordering the reader chooses. */
  const priced = !!markets
  const { main, dust, dustValue, dustUnpriced } = useMemo(() => {
    const main: Row[] = []
    const dust: Row[] = []
    let dustValue = 0
    let dustUnpriced = 0
    for (const r of rows) {
      const worthless = priced && (r.valueEth === null || r.valueEth < DUST_ETH)
      const untraded = r.p.realisedEth === 0 && r.p.ethSpent < DUST_ETH
      if (worthless && untraded) {
        dust.push(r)
        dustValue += r.valueEth || 0
        if (r.valueEth === null) dustUnpriced++
      } else main.push(r)
    }
    return { main: sortRows(main, sort), dust: sortRows(dust, sort), dustValue, dustUnpriced }
  }, [rows, sort, priced])

  const showDust = dustPref ?? (main.length === 0 && dust.length > 0)
  /* A reconstruction that FAILED is not one that finished. Every figure below
     that reads "we have looked" has to mean this, not merely that the walk
     returned. */
  const reconstructed = !!data && !data.failed

  const totals = useMemo(() => {
    let value = 0
    let realised = 0
    let unrealised = 0
    let paid = 0
    let paidUnpriced = 0
    let unpriced = 0
    for (const r of rows) {
      /* Zero until the walk has run, and the strip shows a dash for it rather
         than the sum — before reconstruction, realised profit is unknown, and
         a confident 0 is the one wrong answer. */
      realised += reconstructed ? r.p.realisedEth : 0
      if (r.valueEth !== null) value += r.valueEth
      else unpriced++
      /* PAID AND UNREALISED COVER THE SAME POSITIONS, or the strip contradicts
         itself. Measured before this: paid Ξ1.4871 beside a value of Ξ0.1845
         and an unrealised of +Ξ0.0191 — three figures that cannot all be true,
         because the cost of 41 positions with no market went into `paid` while
         only the priced ones could reach `unrealised`. The dead cost is a real
         and interesting number, so it is reported beside them rather than
         folded into one. */
      if (r.unrealised !== null) {
        unrealised += r.unrealised
        paid += (r.p.avgCostEth as number) * r.p.amount
      } else if (r.p.avgCostEth !== null) {
        paidUnpriced += r.p.avgCostEth * r.p.amount
      }
    }
    return { value, realised, unrealised, paid, paidUnpriced, unpriced }
  }, [rows, reconstructed])

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

        {/* Reading a wallet needs no key, so requiring one to look was a habit
            rather than a constraint — and the address goes in the URL, so any
            view of this page is shareable and survives a reload. */}
        <div className="mt-8 border-t border-edge pt-5">
          <p className="font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
            Or read any address
          </p>
          <WalletBar
            connected={null}
            active={null}
            saved={saved}
            onOpen={openWallet}
            onToggleSave={toggleSave}
            onAdd={addWatched}
            onConnect={onConnect}
            showConnect={false}
          />
        </div>
        {err && <p className="mt-4 text-sm text-warn">{err}</p>}
      </Page>
    )
  }

  const columns = 9

  return (
    <Page>
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
        <h1 className="font-display text-[clamp(1.25rem,2.6vw,2.1rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.02em]">
          Portfolio
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {watching && (
            <span className="font-mono text-micro uppercase tracking-[0.12em] text-warn">
              watching · read only
            </span>
          )}
          <a
            href={`${EXPLORER}/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="scan-link font-mono text-micro uppercase tracking-[0.14em] text-fg-dim"
          >
            {shortAddr(address)}
          </a>
          <button
            type="button"
            onClick={() => load(address)}
            className="chip font-mono text-micro uppercase tracking-[0.12em] text-fg-dim hover:text-fg"
          >
            Refresh
          </button>
        </div>
      </div>

      <WalletBar
        connected={connected}
        active={watching ? watched : null}
        saved={saved}
        onOpen={openWallet}
        onToggleSave={toggleSave}
        onAdd={addWatched}
        onConnect={onConnect}
      />

      {/* The four figures, in the unit they were actually earned in. No dollar
          conversion: see the note in lib/portfolio.ts — pricing a trade in
          dollars needs an ETH price history this chain does not have, and a
          converted number would be a guess wearing a currency symbol. */}
      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-edge py-4 sm:grid-cols-4">
        <Figure
          label="held now"
          note={totals.unpriced > 0 ? `${totals.unpriced} with no market` : undefined}
        >
          <span className="text-fg">{rows.length ? fmtTotal(totals.value) : "—"}</span>
        </Figure>
        <Figure
          label="you paid"
          note={
            reconstructed
              ? totals.paidUnpriced > 0
                ? `${fmtTotal(totals.paidUnpriced)} more with no market`
                : "traced buys"
              : undefined
          }
        >
          {/* Three states, not two. A read that FAILED is not a read still
              running, and leaving the waiting mark up forever told a reader to
              keep waiting for something that had already stopped. */}
          {reconstructed ? (
            <span className="text-fg-muted">{fmtTotal(totals.paid)}</span>
          ) : pricing ? (
            <Pending />
          ) : (
            <span className="text-fg-dim">—</span>
          )}
        </Figure>
        <Figure label="unrealised">
          <Pnl eth={reconstructed ? totals.unrealised : null} pending={pricing} total />
        </Figure>
        <Figure label="realised">
          <Pnl eth={reconstructed ? totals.realised : null} pending={pricing} total />
        </Figure>
      </div>

      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
        <span>
          {rows.length} position{rows.length === 1 ? "" : "s"}
        </span>
        {reconstructed && <span>{data!.tradesPriced} trades priced</span>}
        {/* Named while it happens, because the cost columns are visibly empty
            for half a minute and an unexplained gap reads as a bug. */}
        {pricing && (
          <span className="text-acid-500">
            reading history
            {progress ? ` · ${progress.done}/${progress.total} transactions` : "…"}
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
      {costErr && <p className="measure mt-3 text-micro leading-relaxed text-warn">{costErr}</p>}

      {data && !data.failed && data.tradesPriced > 0 && !data.historyComplete && (
        <p className="measure mt-3 text-micro leading-relaxed text-warn">
          This wallet has more history than we read. Cost and realised profit cover the most recent
          {" "}{data.tradesPriced} priced trades, so both are a floor rather than a total.
        </p>
      )}
      {data && data.tradesUntraced > 0 && (
        <p className="measure mt-2 text-micro leading-relaxed text-fg-dim">
          {data.tradesUntraced} movement{data.tradesUntraced === 1 ? "" : "s"} could not be priced —
          tokens that arrived in a transaction this wallet did not send, or several trades batched
          into one call. Those are counted as held, never as free.
        </p>
      )}

      <section className="mt-[4vh]">
        <SectionHead
          title="Positions"
          note={rows.length ? `${rows.length} held` : "…"}
        />
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
                    <Th label="Token" sortKey="token" active={sort} onSort={setSort} align="left" />
                    <Th label="Amount" sortKey="amount" active={sort} onSort={setSort} className="hidden sm:table-cell" />
                    <Th label="Avg cost" sortKey="cost" active={sort} onSort={setSort} className="hidden sm:table-cell" />
                    <Th label="Price" sortKey="price" active={sort} onSort={setSort} className="hidden md:table-cell" />
                    <Th label="Value" sortKey="value" active={sort} onSort={setSort} />
                    <Th label="Unrealised" short="P&L" sortKey="unrealised" active={sort} onSort={setSort} />
                    <Th label="Realised" sortKey="realised" active={sort} onSort={setSort} className="hidden lg:table-cell" />
                    <th scope="col" className={`${TH_BASE} hidden text-left md:table-cell`}>
                      Our read
                    </th>
                    <th scope="col" className={`${TH_BASE} text-right`}>
                      <span className="sr-only">Detail</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {main.map((r) => (
                    <PositionRow
                      key={r.p.address}
                      row={r}
                      reconstructed={reconstructed}
                      pricing={pricing}
                      intelDone={intelDone}
                      open={open === r.p.address}
                      onToggle={() => setOpen(open === r.p.address ? null : r.p.address)}
                      columns={columns}
                    />
                  ))}

                  {dust.length > 0 && (
                    <tr className="border-b border-edge">
                      <td colSpan={columns} className="px-1.5 py-0 sm:px-2">
                        <button
                          type="button"
                          onClick={() => setDustPref(!showDust)}
                          aria-expanded={showDust}
                          className="chip flex w-full items-baseline gap-x-2 py-2.5 text-left font-mono text-micro uppercase tracking-[0.12em] text-fg-dim hover:text-fg"
                        >
                          <span aria-hidden="true">{showDust ? "−" : "+"}</span>
                          <span>
                            {dust.length} small position{dust.length === 1 ? "" : "s"}
                          </span>
                          {/* Named separately because they are two different
                              reasons to be down here: too little to matter, and
                              nowhere to sell it. */}
                          {/* The breakdown is worth reading and is not worth a
                              second wrapped line on a phone. */}
                          <span className="hidden text-fg-dim/70 sm:inline">
                            {dustUnpriced > 0 && `· ${dustUnpriced} with no market `}
                            {dustUnpriced < dust.length && `· ${fmtEth(dustValue, 5)} together`}
                          </span>
                        </button>
                      </td>
                    </tr>
                  )}

                  {showDust &&
                    dust.map((r) => (
                      <PositionRow
                        key={r.p.address}
                        row={r}
                        reconstructed={reconstructed}
                        pricing={pricing}
                        intelDone={intelDone}
                        open={open === r.p.address}
                        onToggle={() => setOpen(open === r.p.address ? null : r.p.address)}
                        columns={columns}
                        dim
                      />
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

function PositionRow({
  row: { p, priceEth, valueEth, unrealised, launch },
  reconstructed,
  pricing,
  intelDone,
  open,
  onToggle,
  columns,
  dim = false,
}: {
  row: Row
  reconstructed: boolean
  pricing: boolean
  intelDone: boolean
  open: boolean
  onToggle: () => void
  columns: number
  dim?: boolean
}) {
  const detailId = `pos-${p.address}`
  const risky = !!launch && launch.riskScore >= 70
  const num = "whitespace-nowrap px-1.5 py-0 text-right font-mono text-micro tabular-nums sm:px-2"

  return (
    <>
      <tr
        className={`scan-tr border-b border-edge ${risky ? "is-risky" : ""} ${open ? "is-open" : ""} ${
          dim ? "text-fg-dim" : ""
        }`}
      >
        <td className="px-1.5 py-0 sm:px-2">
          <Link
            to={`/app/token/${p.address}`}
            aria-label={`${p.symbol} ${p.name}`.trim() || `Token ${shortAddr(p.address)}`}
            className="flex min-w-0 items-center gap-x-2 py-2"
          >
            <TokenMark src={launch?.logo || null} symbol={p.symbol} />
            <span className="font-mono text-xs font-semibold text-fg">{p.symbol}</span>
            <span className="min-w-0 max-w-[10ch] truncate text-micro text-fg-dim lg:max-w-[22ch]">
              {p.name}
            </span>
            {/* The amount column does not fit a phone, and the holding is the
                one figure that cannot simply be dropped. */}
            <span className="whitespace-nowrap font-mono text-micro tabular-nums text-fg-dim sm:hidden">
              {fmtAmount(p.amount)}
            </span>
            {/* The cost is a floor, and the row says so where the number is,
                not in a footnote under the table. */}
            {reconstructed && p.costIncomplete && (
              <span
                className="whitespace-nowrap font-mono text-micro text-fg-dim"
                title="Part of this position arrived without a traceable ETH cost"
              >
                partial
              </span>
            )}
          </Link>
        </td>
        <td className={`${num} hidden text-fg-muted sm:table-cell`}>{fmtAmount(p.amount)}</td>
        <td className={`${num} hidden text-fg-muted sm:table-cell`}>
          {p.avgCostEth !== null ? (
            `Ξ${p.avgCostEth.toExponential(1)}`
          ) : pricing ? (
            <Pending />
          ) : (
            <span className="text-fg-dim">—</span>
          )}
        </td>
        <td className={`${num} hidden text-fg-muted md:table-cell`}>
          {priceEth === null ? <span className="text-fg-dim">—</span> : `Ξ${priceEth.toExponential(1)}`}
        </td>
        <td className={`${num} ${dim ? "text-fg-muted" : "text-fg"}`}>
          {valueEth === null ? <span className="text-fg-dim">—</span> : fmtEth(valueEth, 5)}
        </td>
        <td className={num}>
          <Pnl eth={unrealised} dp={5} pending={pricing && p.avgCostEth === null} />
        </td>
        <td className={`${num} hidden lg:table-cell`}>
          {/* Null until the walk has run. Before that nothing is reconstructed,
              so realised profit is UNKNOWN — and rendering the 0 the type
              carries would tell the reader they had taken nothing out when we
              simply had not looked yet. */}
          <Pnl eth={reconstructed ? p.realisedEth : null} dp={5} pending={pricing} />
        </td>
        {/* The column no explorer can render: what our index thinks of the
            thing they are holding. */}
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
            ) : intelDone ? (
              /* Not indexed is not a verdict. It usually means the token
                 launched before our watcher existed. */
              <span className="font-mono text-micro text-fg-dim">not indexed</span>
            ) : (
              <Pending />
            )}
          </div>
        </td>
        <td className="px-1.5 py-0 text-right sm:px-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={detailId}
            className="chip px-2.5 py-3 font-mono text-micro leading-none text-fg-dim hover:text-fg"
          >
            <span className="sr-only">
              {open ? "Hide" : "Show"} trades and actions for {p.symbol}
            </span>
            <span aria-hidden="true">{open ? "−" : "+"}</span>
          </button>
        </td>
      </tr>

      {open && (
        <tr className="detail-tr border-b border-edge">
          <td colSpan={columns} id={detailId} className="px-1.5 pb-4 pt-1 sm:px-2">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_13rem]">
              <div className="min-w-0">
                <div className="mb-1.5 font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
                  {p.trades.length
                    ? `${p.trades.length} movement${p.trades.length === 1 ? "" : "s"} read`
                    : "History"}
                </div>
                <TradeHistory p={p} />
              </div>
              {/* Selling was three clicks and a tab switch away — the feed, the
                  token, then the sell tab — on the one page whose reader is
                  looking at something they already own. */}
              <div className="flex flex-wrap gap-2 lg:flex-col">
                <Link to={`/app/token/${p.address}?side=sell`} className={`${ACTION} text-acid-500`}>
                  Sell {p.symbol}
                </Link>
                <Link to={`/app/token/${p.address}`} className={`${ACTION} text-fg-muted`}>
                  Buy more
                </Link>
                <a
                  href={`${EXPLORER}/token/${p.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`${ACTION} text-fg-dim`}
                >
                  Explorer
                </a>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
