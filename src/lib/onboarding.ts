/* Funnel telemetry.
 *
 * The anonId is generated before any wallet exists — that is the entire point.
 * Without an identifier that predates the connect step we cannot see the people
 * who leave, and "is the data ask friction?" stays a matter of opinion.
 */
import { API } from "./api"

export const K_ANON = "newera_anon_id"
export const K_DONE = "newera_onboarded"
export const K_INTENT = "newera_intent"
export const K_ADDR = "newera_address"

export type Step =
  | "MODAL_SHOWN"
  | "INTENT_SELECTED"
  | "CONNECT_CLICKED"
  | "WALLET_CHOSEN"
  | "SIGN_REQUESTED"
  | "CONNECT_COMPLETED"
  | "CONNECT_REJECTED"
  | "CONTACT_SUBMITTED"
  | "CONTACT_SKIPPED"
  | "MODAL_DISMISSED"
  | "COMPLETED"

export type Intent = "TRADE" | "LAUNCH" | "CREATE" | "EXPLORE"

export function anonId(): string {
  let id = localStorage.getItem(K_ANON)
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0
            return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
          })
    localStorage.setItem(K_ANON, id)
  }
  return id
}

export function isOnboarded(): boolean {
  return localStorage.getItem(K_DONE) === "1" || !!localStorage.getItem(K_ADDR)
}

function param(name: string): string | null {
  try {
    return new URLSearchParams(location.search).get(name)
  } catch {
    return null
  }
}

let firstEvent = true

/**
 * Fire-and-forget. Uses sendBeacon where available so an event fired as the
 * user navigates away — the dismissals we most need to see — still lands.
 */
export function track(step: Step, meta?: Record<string, unknown>) {
  const body: Record<string, unknown> = { anonId: anonId(), step }
  if (meta) body.meta = meta
  if (meta && typeof meta.intent === "string") body.intent = meta.intent

  // Attribution only needs to ride along once per visitor row.
  if (firstEvent) {
    firstEvent = false
    body.referrer = document.referrer || null
    body.utmSource = param("utm_source")
    body.utmCampaign = param("utm_campaign")
    body.landingPath = location.pathname + location.search
  }

  const json = JSON.stringify(body)
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(`${API}/onboarding/event`, new Blob([json], { type: "application/json" }))
      return
    }
  } catch {
    /* fall through to fetch */
  }
  fetch(`${API}/onboarding/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json,
    keepalive: true,
  }).catch(() => {})
}
