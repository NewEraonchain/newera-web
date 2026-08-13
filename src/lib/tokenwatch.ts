/* Tokens this browser is keeping an eye on.
 *
 * The same shape and the same promise as the wallet watchlist: localStorage,
 * this device, no account, nothing sent anywhere. A list of tokens somebody is
 * interested in is a trading position in everything but name, and it is not
 * ours to hold.
 *
 * Separate key and separate module from `watchlist.ts` because they are
 * separate things — a wallet you watch is somebody else's, a token you watch is
 * something you are deciding about — and one list of forty tokens should not be
 * able to evict the three wallets you actually use.
 */

const KEY = "newera.tokens.v1"
/* The API's bulk lookup takes a hundred addresses in one request; fifty keeps
   the whole watchlist inside a single call with room to spare, and a list
   longer than that has stopped being a watchlist. */
const MAX = 50

export const isAddress = (a: string) => /^0x[a-f0-9]{40}$/.test(a.trim().toLowerCase())

export function readTokenWatch(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: string[] = []
    const seen = new Set<string>()
    for (const row of parsed) {
      const a = String(row || "").toLowerCase()
      if (!isAddress(a) || seen.has(a)) continue
      seen.add(a)
      out.push(a)
      if (out.length >= MAX) break
    }
    return out
  } catch {
    /* Storage off, quota gone, or something else wrote to this key. An empty
       watchlist is a working page; a throw on read is not. */
    return []
  }
}

function write(list: string[]): string[] {
  const capped = list.slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(capped))
  } catch {
    // Private mode or a full quota. It still holds for this session.
  }
  return capped
}

/** Newest first, so the token just starred is the one at the top of the view. */
export function toggleTokenWatch(address: string): string[] {
  const a = address.trim().toLowerCase()
  if (!isAddress(a)) return readTokenWatch()
  const current = readTokenWatch()
  return current.includes(a) ? write(current.filter((x) => x !== a)) : write([a, ...current])
}

export function isTokenWatched(address: string): boolean {
  return readTokenWatch().includes(address.trim().toLowerCase())
}
