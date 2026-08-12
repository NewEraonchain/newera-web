/* What a wallet holds, what it paid, and what it has taken out.
 *
 * ENTIRELY CLIENT-SIDE, and that is a product decision rather than an
 * implementation one. NewEra holds no keys and takes no custody; storing a
 * reconstruction of somebody's trading history on our server would make us hold
 * something after all. The address never leaves the browser except to the public
 * explorer that already knows it.
 *
 * THE INFERENCE, AND WHY IT IS NOT THE OBVIOUS ONE.
 *
 * There is no "swap" event anywhere on chain. A trade is a transaction where a
 * token moved one way and ETH moved the other, and the cost basis is entirely
 * that inference — so it is worth saying exactly how it is drawn.
 *
 * The obvious approach is to read the wallet's own transfers and net them. That
 * was tried and it prices NOTHING, because on this chain the ETH side never
 * touches the wallet. A measured example: the wallet calls a router, and the
 * transaction contains
 *
 *     WETH     router      -> PoolManager     0.312
 *     HOODFOX  PoolManager -> the wallet      748,374,124…
 *
 * The wallet is not the sender or the recipient of the WETH. Reading only its
 * own transfers, every buy looks free — which would have reported an infinite
 * return on every position.
 *
 * So the cost comes from the TRANSACTION's full transfer list, priced by the
 * single WETH leg in it. Measured across a real trader's history: 11 of 12
 * transactions carry exactly one WETH leg and exactly one of our tokens, and
 * the twelfth is a plain transfer with no ETH at all — correctly unpriceable.
 * A transaction with several WETH legs or several of our tokens is a batch, and
 * splitting it by a rule the user never agreed to would be a guess, so it is
 * left untraced and named.
 *
 * DENOMINATED IN ETH, NOT DOLLARS. Pricing a trade in USD needs the ETH price
 * at the moment of that trade, and no verifiable history of it exists for this
 * chain. ETH is what the pools quote, what the trader paid, and what we can
 * prove. A dollar figure would be a second guess stacked on the first.
 */

const EXPLORER = "https://robinhoodchain.blockscout.com/api/v2"
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73"

/** Pages of the wallet's own history to walk before giving up. */
const MAX_PAGES = 4
/** Transactions to price. Each costs one request, so this is the page's budget. */
const MAX_TRADES = 120
/** Concurrent transaction reads. Enough to be quick, few enough to be polite. */
const CONCURRENCY = 6

export type Position = {
  address: string
  symbol: string
  name: string
  decimals: number
  balance: bigint
  amount: number

  /** ETH paid across traced buys. */
  ethSpent: number
  /** ETH received across traced sells. */
  ethReceived: number
  boughtAmount: number
  soldAmount: number

  /** Weighted average ETH per token across traced buys. Null when none. */
  avgCostEth: number | null
  /** Profit already taken, in ETH, measured against the average paid. */
  realisedEth: number

  /** Tokens that arrived with no priceable ETH leg — an airdrop, a mint, a
      transfer in. Never treated as free. */
  untracedAmount: number
  /** True when the cost shown is a floor rather than the answer. */
  costIncomplete: boolean
}

export type PortfolioResult = {
  positions: Position[]
  /** Transactions actually priced. */
  tradesPriced: number
  /** Transactions seen but left untraced (batched, or no ETH leg). */
  tradesUntraced: number
  /** False when the wallet has more history than the caps above allowed. */
  historyComplete: boolean
  failed: boolean
}

const lower = (s: unknown) => String(s ?? "").toLowerCase()
const big = (s: unknown) => {
  try {
    return BigInt(String(s ?? "0"))
  } catch {
    return 0n
  }
}
const toNumber = (v: bigint, decimals: number) => Number(v) / 10 ** decimals

type RawTransfer = {
  token?: { address_hash?: string; symbol?: string; name?: string; decimals?: string }
  total?: { value?: string }
  from?: { hash?: string }
  to?: { hash?: string }
  transaction_hash?: string
  timestamp?: string
}

async function walk(path: string, wallet: string, maxPages: number) {
  const items: RawTransfer[] = []
  let next: Record<string, string> | null = null
  for (let read = 0; read < maxPages; read++) {
    const qs = next ? "?" + new URLSearchParams(next).toString() : ""
    const r = await fetch(`${EXPLORER}/addresses/${wallet}/${path}${qs}`)
    if (!r.ok) break
    const j = (await r.json()) as { items?: RawTransfer[]; next_page_params?: Record<string, string> | null }
    items.push(...(j.items || []))
    next = j.next_page_params || null
    if (!next) return { items, complete: true }
  }
  return { items, complete: false }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++
        try {
          out[idx] = await fn(items[idx])
        } catch {
          out[idx] = null as R
        }
      }
    })
  )
  return out
}

type Trade = {
  at: string
  token: string
  symbol: string
  name: string
  decimals: number
  /** Signed, from the wallet's point of view. */
  tokenDelta: bigint
  /** ETH that changed hands in this transaction, unsigned. */
  eth: bigint
  priceable: boolean
}

/** Price one transaction by its full transfer list. */
function readTrade(items: RawTransfer[], wallet: string, ethFromInternal: bigint): Trade | null {
  const me = lower(wallet)
  let weth = 0n
  const ours = new Map<string, Trade>()

  for (const t of items) {
    const addr = lower(t.token?.address_hash)
    if (!addr) continue
    const value = big(t.total?.value)
    if (value === 0n) continue

    if (addr === WETH) {
      /* Every WETH movement in the transaction, whoever moved it. The router
         pays on the wallet's behalf, so restricting this to the wallet's own
         transfers is exactly what made the first version price nothing. */
      weth += value
      continue
    }

    const from = lower(t.from?.hash)
    const to = lower(t.to?.hash)
    const delta = to === me ? value : from === me ? -value : 0n
    if (delta === 0n) continue

    const cur = ours.get(addr)
    if (cur) cur.tokenDelta += delta
    else
      ours.set(addr, {
        at: String(t.timestamp || ""),
        token: addr,
        symbol: t.token?.symbol || "?",
        name: t.token?.name || "",
        decimals: Number(t.token?.decimals ?? 18),
        tokenDelta: delta,
        eth: 0n,
        priceable: false,
      })
  }

  const moved = [...ours.values()].filter((t) => t.tokenDelta !== 0n)
  if (moved.length !== 1) return null // batch, or nothing of ours moved

  const trade = moved[0]
  /* Native ETH counts too: a v4 pool paired against ETH has no WETH transfer at
     all, and the value arrives as an internal transaction instead. */
  const eth = weth > 0n ? weth : ethFromInternal < 0n ? -ethFromInternal : ethFromInternal
  trade.eth = eth
  trade.priceable = eth > 0n
  return trade
}

export async function loadPortfolio(wallet: string): Promise<PortfolioResult> {
  const empty: PortfolioResult = {
    positions: [],
    tradesPriced: 0,
    tradesUntraced: 0,
    historyComplete: false,
    failed: true,
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return empty

  const me = lower(wallet)
  let balancesRaw: unknown[]
  let own: { items: RawTransfer[]; complete: boolean }
  let internal: { items: RawTransfer[]; complete: boolean }
  try {
    const [b, t, i] = await Promise.all([
      fetch(`${EXPLORER}/addresses/${wallet}/token-balances`).then((r) => (r.ok ? r.json() : [])),
      walk("token-transfers", wallet, MAX_PAGES),
      walk("internal-transactions", wallet, 2),
    ])
    balancesRaw = Array.isArray(b) ? b : []
    own = t
    internal = i
  } catch {
    return empty
  }

  /* Native ETH per transaction, signed. Only used when a transaction has no
     WETH leg, which is the v4-against-ETH case. */
  const ethByTx = new Map<string, bigint>()
  for (const r of internal.items as unknown as { value?: string; from?: { hash?: string }; to?: { hash?: string }; transaction_hash?: string }[]) {
    const v = big(r.value)
    if (v === 0n) continue
    const delta = lower(r.to?.hash) === me ? v : lower(r.from?.hash) === me ? -v : 0n
    if (delta === 0n) continue
    const tx = lower(r.transaction_hash)
    ethByTx.set(tx, (ethByTx.get(tx) || 0n) + delta)
  }

  /* Transactions worth pricing: ones where a non-WETH token touched the wallet.
     Newest first from the explorer, so the cap keeps recent trades. */
  const candidates: string[] = []
  const seen = new Set<string>()
  for (const t of own.items) {
    if (lower(t.token?.address_hash) === WETH) continue
    const tx = lower(t.transaction_hash)
    if (!tx || seen.has(tx)) continue
    seen.add(tx)
    candidates.push(tx)
    if (candidates.length >= MAX_TRADES) break
  }

  const trades = await mapLimit(candidates, CONCURRENCY, async (tx) => {
    const r = await fetch(`${EXPLORER}/transactions/${tx}/token-transfers`)
    if (!r.ok) return null
    const items = ((await r.json()) as { items?: RawTransfer[] }).items || []
    return readTrade(items, wallet, ethByTx.get(tx) || 0n)
  })

  /* Oldest first. A weighted average is order-dependent, and running it
     backwards prices every sale against buys that had not happened yet. */
  const ordered = trades.filter((t): t is Trade => !!t).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))

  type Acc = Omit<Position, "balance" | "amount">
  const acc = new Map<string, Acc>()
  let priced = 0
  let untraced = 0

  for (const t of ordered) {
    let a = acc.get(t.token)
    if (!a) {
      a = {
        address: t.token,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        ethSpent: 0,
        ethReceived: 0,
        boughtAmount: 0,
        soldAmount: 0,
        avgCostEth: null,
        realisedEth: 0,
        untracedAmount: 0,
        costIncomplete: false,
      }
      acc.set(t.token, a)
    }

    const amount = toNumber(t.tokenDelta < 0n ? -t.tokenDelta : t.tokenDelta, t.decimals)
    if (!t.priceable) {
      untraced++
      if (t.tokenDelta > 0n) {
        a.untracedAmount += amount
        a.costIncomplete = true
      }
      continue
    }

    priced++
    const eth = toNumber(t.eth, 18)
    if (t.tokenDelta > 0n) {
      a.ethSpent += eth
      a.boughtAmount += amount
      a.avgCostEth = a.boughtAmount > 0 ? a.ethSpent / a.boughtAmount : null
    } else {
      a.ethReceived += eth
      a.soldAmount += amount
      if (a.avgCostEth !== null) a.realisedEth += eth - a.avgCostEth * amount
      else a.costIncomplete = true
    }
  }

  /* Balances are the truth about what is held NOW. The walk above explains how
     it got there, but a capped history cannot be trusted to reproduce it. */
  const positions: Position[] = []
  for (const b of balancesRaw as { token?: Record<string, string>; value?: string }[]) {
    const t = b.token
    if (!t?.address_hash) continue
    const address = lower(t.address_hash)
    if (address === WETH) continue
    const balance = big(b.value)
    if (balance === 0n) continue
    const decimals = Number(t.decimals ?? 18)
    const a = acc.get(address)

    positions.push({
      address,
      symbol: t.symbol || a?.symbol || "?",
      name: t.name || a?.name || "",
      decimals,
      balance,
      amount: toNumber(balance, decimals),
      ethSpent: a?.ethSpent ?? 0,
      ethReceived: a?.ethReceived ?? 0,
      boughtAmount: a?.boughtAmount ?? 0,
      soldAmount: a?.soldAmount ?? 0,
      avgCostEth: a?.avgCostEth ?? null,
      realisedEth: a?.realisedEth ?? 0,
      untracedAmount: a?.untracedAmount ?? 0,
      costIncomplete: (a?.costIncomplete ?? false) || !own.complete || a?.avgCostEth == null,
    })
  }

  // Biggest position by what it cost, so the page opens on what matters.
  positions.sort((x, y) => y.ethSpent - x.ethSpent || y.amount - x.amount)

  return {
    positions,
    tradesPriced: priced,
    tradesUntraced: untraced,
    historyComplete: own.complete && candidates.length < MAX_TRADES,
    failed: false,
  }
}

/** Unrealised profit at a given ETH price. Null when there is no traced cost. */
export function unrealisedEth(p: Position, priceEth: number | null): number | null {
  if (priceEth === null || p.avgCostEth === null) return null
  return (priceEth - p.avgCostEth) * p.amount
}
