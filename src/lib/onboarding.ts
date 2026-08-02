/* Funnel telemetry.
 *
 * The anonId is generated before any wallet exists — that is the entire point.
 * Without an identifier that predates the connect step we cannot see the people
 * who leave, and "is the data ask friction?" stays a matter of opinion.
 */
import { API } from "./api"

export const K_ANON = "newera_anon_id"
export const K_DONE = "newera_onboarded"
export const K_DECLINED = "newera_onboard_declined"
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

/* Declining is not the same as onboarding, so it gets its own key — but it has
   to be remembered, or Escape / × / "Skip this" all return the visitor to the
   same survey on the next cluster page, forever. Someone opening a shared
   cluster link was being handed "What brings you here?" instead of the cluster
   every single time.
 *
 * Thirty days, not never: the ask is legitimate, it just must not be endless. */
export function wasDeclined(): boolean {
  const t = localStorage.getItem(K_DECLINED)
  if (!t) return false
  return Date.now() - Number(t) < 30 * 24 * 60 * 60 * 1000
}

/* Asking for it, from anywhere.
 *
 * The dialog used to open on exactly one route — a cluster detail page — and
 * nowhere else, with no control that opened it. So a visitor who came in on the
 * feed, which is the acquisition surface and the one route deliberately left
 * ungated, had no way to onboard at all; and anyone who dismissed it once was
 * locked out for the thirty days `wasDeclined` remembers.
 *
 * This is the deliberate way in, so it ignores both flags. Declining an
 * interruption is not declining the offer, and a control the visitor pressed
 * themselves must always do what it says. */
export const ONBOARD_EVENT = "newera:onboard"
/** Fired when onboarding completes, so chrome that reads `isOnboarded()` can
    catch up without a reload. */
export const ONBOARD_DONE_EVENT = "newera:onboarded"

/* No `track()` here. The modal already fires MODAL_SHOWN on open, so doing it
   here too logged every deliberate open twice — and pressing the control while
   the dialog was already open logged it again with no state change, making the
   count unbounded. The modal is the single place that knows it actually opened;
   `source` rides along on the event for it to report. */
export function openOnboarding(source: string) {
  window.dispatchEvent(new CustomEvent(ONBOARD_EVENT, { detail: { source } }))
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

  // fetch(keepalive) rather than sendBeacon. A beacon carrying an
  // application/json Blob needs a CORS preflight and the browser rejects the
  // response — verified against the deployed API, where the beacon failed with
  // "Response to preflight request doesn't pass access control check" while the
  // identical fetch reached the server. Since the API is on another origin,
  // every event was being dropped silently and the funnel read zero.
  // keepalive gives the same survives-unload guarantee that sendBeacon was
  // chosen for.
  fetch(`${API}/onboarding/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {})
}
