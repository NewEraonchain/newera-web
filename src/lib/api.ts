/* Single place that knows where the backend lives. */
export const API =
  (import.meta.env.VITE_NEWERA_API as string | undefined) ||
  "https://newerabackend-production.up.railway.app"

export async function getJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: { accept: "application/json", ...(init?.headers || {}) },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export function authHeaders(): Record<string, string> {
  const t = localStorage.getItem("newera_token")
  return t
    ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` }
    : { "Content-Type": "application/json" }
}

/* ---- shared shapes returned by /intel ---- */
export type Launch = {
  address: string
  name: string
  symbol: string
  creator: string
  launchpad: string
  devBuyEth: number
  launchedAt: string
  ageSeconds: number
  spoofFlags: string[]
  dupeCount: number
  riskScore: number
  txHash: string
  theme: { id: string; label: string; slug: string; status: ThemeStatus } | null
}

export type ThemeStatus = "EMERGING" | "HOT" | "SATURATED" | "DECAYING"

export type Theme = {
  id: string
  label: string
  slug: string
  status: ThemeStatus
  launchCount: number
  creatorCount: number
  organicRatio: number
  isOrganic: boolean
  peakVelocity: number
  firstSeenAt: string
  lastSeenAt: string
  ageMinutes: number
  samples: { symbol: string; name: string; address: string; riskScore: number }[]
}

export type Stats = {
  launchesLastHour: number
  launchesLast24h: number
  activeThemes: number
  duplicatesLast24h: number
  duplicatePct: number
  highRiskLast24h: number
  highRiskPct: number
  distinctCreators24h: number
  indexedThroughBlock: string | null
  lastIngestAt: string | null
}

export function ago(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

export function shortAddr(a?: string | null): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ""
}
