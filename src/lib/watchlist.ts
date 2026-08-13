/* Wallets this browser keeps an eye on.
 *
 * LOCAL, and that is the whole design. The portfolio already reads any address
 * without a signature — a watchlist is just remembering which ones you asked
 * for, and remembering it on our server would turn a page that stores nothing
 * into one that holds a list of addresses somebody cared about. That list is
 * worth more to an attacker than it is to us.
 *
 * So: localStorage, this device, no account, no sync. The cost is that the list
 * does not follow you to another browser, and the URL already covers that case
 * — `/portfolio?address=0x…` is shareable and survives a paste.
 */

const KEY = "newera.watchlist.v1"
/* Enough to hold a trader's own wallets and a few they follow. A cap at all is
   what stops a bug or a bored user filling the origin's storage quota. */
const MAX = 12

export type Watched = {
  address: string
  /** What the reader called it. Never derived — an unnamed wallet shows its address. */
  label?: string
}

export const isAddress = (a: string) => /^0x[a-f0-9]{40}$/.test(a.trim().toLowerCase())

export function readWatchlist(): Watched[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: Watched[] = []
    const seen = new Set<string>()
    for (const row of parsed) {
      /* Every field re-checked. This is our own data until someone else's
         extension, or an older version of this code, writes something else
         into the same key. */
      const address = String((row as Watched)?.address || "").toLowerCase()
      if (!isAddress(address) || seen.has(address)) continue
      seen.add(address)
      const label = String((row as Watched)?.label || "").slice(0, 24).trim()
      out.push(label ? { address, label } : { address })
      if (out.length >= MAX) break
    }
    return out
  } catch {
    /* Storage disabled, quota gone, or JSON somebody else wrote. A portfolio
       with no watchlist is a portfolio; one that throws on load is not. */
    return []
  }
}

function write(list: Watched[]): Watched[] {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    // Private mode, or a full quota. The list still works for this session.
  }
  return list.slice(0, MAX)
}

/** Newest first, so the wallet you just added is the one nearest the pointer. */
export function watch(address: string, label?: string): Watched[] {
  const a = address.trim().toLowerCase()
  if (!isAddress(a)) return readWatchlist()
  const rest = readWatchlist().filter((w) => w.address !== a)
  const clean = (label || "").slice(0, 24).trim()
  return write([clean ? { address: a, label: clean } : { address: a }, ...rest])
}

export function unwatch(address: string): Watched[] {
  const a = address.trim().toLowerCase()
  return write(readWatchlist().filter((w) => w.address !== a))
}

export function isWatched(address: string | null): boolean {
  if (!address) return false
  const a = address.toLowerCase()
  return readWatchlist().some((w) => w.address === a)
}
