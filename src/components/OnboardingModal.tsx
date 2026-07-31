import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Dialog as D } from "radix-ui"
import gsap from "gsap"
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin"
import { API, authHeaders } from "@/lib/api"
import { anonId, track, K_DONE, K_DECLINED, K_INTENT } from "@/lib/onboarding"
import type { Intent } from "@/lib/onboarding"
import { connect, isRejection, currentAddress } from "@/lib/wallet"
import type { ConnectKind } from "@/lib/wallet"
import { ScanRow, WALLETS } from "@/components/rows"

gsap.registerPlugin(ScrambleTextPlugin)

/* Flow: intent → wallet → optional contact → optional email code.
 *
 * Intent is asked BEFORE the wallet prompt on purpose. It costs one tap and no
 * popup, so we still learn why someone came even if they abandon at the
 * signature — which is where crypto onboarding actually loses people.
 *
 * Radix supplies the behaviour only — focus trap, focus restore, escape, scroll
 * lock, aria wiring. None of its looks: this is the last surface on the site
 * that was still a rounded gradient card with emoji, and a modal wearing another
 * design's clothes undoes the world every other page builds. Structure here
 * comes from rules, mono labels and rows, like everywhere else. */

const INTENTS: { id: Intent; name: string; desc: string }[] = [
  { id: "TRADE", name: "Trade", desc: "Find and trade tokens" },
  { id: "LAUNCH", name: "Launch", desc: "Deploy my own token" },
  { id: "CREATE", name: "Create", desc: "Build on the data" },
  { id: "EXPLORE", name: "Just looking", desc: "Show me around" },
]

const STEPS = [
  {
    label: "Intent",
    title: "What are you here for?",
    sub: "One tap. It decides what the feed puts in front of you first.",
  },
  {
    label: "Wallet",
    title: "Your wallet is your account.",
    sub: "No password and no email. Signing proves the address is yours — it authorises no transaction and moves nothing.",
  },
  {
    label: "Alerts",
    title: "You're in.",
    sub: "One optional step, then straight to the feed.",
  },
  {
    label: "Verify",
    title: "Check your inbox.",
    sub: "A six-digit code, good for fifteen minutes.",
  },
]

export default function OnboardingModal({
  open,
  onClose,
  onFinish,
}: {
  open: boolean
  onClose: (reason: string) => void
  onFinish: () => void
}) {
  const [step, setStep] = useState(0)
  const [intent, setIntent] = useState<Intent | null>(null)
  const [addr, setAddr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; kind?: "err" | "ok" } | null>(null)
  const [email, setEmail] = useState("")
  const [tg, setTg] = useState("")
  const [code, setCode] = useState("")
  // Radix reports "it closed", not how. The handlers below name it first.
  const reason = useRef("dismiss")

  // Open: restore any earlier answer, pick the right starting step, and record it.
  useEffect(() => {
    if (!open) return
    const saved = localStorage.getItem(K_INTENT) as Intent | null
    if (saved) setIntent(saved)
    const existing = currentAddress()
    if (existing) {
      setAddr(existing)
      setStep(2)
    } else if (saved) {
      setStep(1)
    } else {
      setStep(0)
    }
    track("MODAL_SHOWN")
  }, [open])

  const dismiss = useCallback(
    (why: string) => {
      track("MODAL_DISMISSED", { at: ["intent", "wallet", "contact", "code"][step], reason: why })
      // Remember the decline, or the next cluster page asks again.
      try {
        localStorage.setItem(K_DECLINED, String(Date.now()))
      } catch {
        // Private mode with storage disabled: the modal reappearing is a far
        // smaller problem than a thrown error taking the page down.
      }
      onClose(why)
    },
    [step, onClose],
  )

  function finish() {
    track("COMPLETED", { intent })
    localStorage.setItem(K_DONE, "1")
    onFinish()
  }

  async function doConnect(kind: ConnectKind) {
    setBusy(true)
    setMsg({ text: "Approve the signature in your wallet…" })
    track("CONNECT_CLICKED", { wallet: kind })
    track("WALLET_CHOSEN", { wallet: kind })
    try {
      track("SIGN_REQUESTED", { wallet: kind })
      const s = await connect(kind, { anonId: anonId(), intent })
      track("CONNECT_COMPLETED", { wallet: kind, isNewUser: s.isNewUser })
      setAddr(s.address)
      setMsg(null)
      setStep(2)
    } catch (err) {
      const rejected = isRejection(err)
      const text = err instanceof Error ? err.message : "Connection failed."
      track("CONNECT_REJECTED", { wallet: kind, rejected, error: text.slice(0, 140) })
      setMsg({
        text: rejected ? "Signature cancelled — no problem, try again when ready." : text,
        kind: "err",
      })
    } finally {
      setBusy(false)
    }
  }

  async function saveContact() {
    if (!email && !tg) {
      track("CONTACT_SKIPPED", { reason: "empty" })
      return finish()
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return setMsg({ text: "That email doesn't look right.", kind: "err" })
    }
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`${API}/onboarding/profile`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ intent, email: email || null, telegramHandle: tg || null }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Could not save.")
      track("CONTACT_SUBMITTED", { email: !!email, telegram: !!tg })
      if (email && d.emailStatus?.pending) {
        setStep(3)
        if (d.emailStatus.dev) {
          setMsg({ text: "Dev mode: no mail provider configured — check the server logs." })
        }
      } else finish()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Could not save.", kind: "err" })
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode() {
    if (!/^\d{6}$/.test(code)) return setMsg({ text: "Enter the 6-digit code.", kind: "err" })
    setBusy(true)
    try {
      const res = await fetch(`${API}/onboarding/email/verify`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ code }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Verification failed.")
      setMsg({ text: "Email verified.", kind: "ok" })
      track("CONTACT_SUBMITTED", { emailVerified: true })
      setTimeout(finish, 700)
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Verification failed.", kind: "err" })
    } finally {
      setBusy(false)
    }
  }

  const s = STEPS[step] ?? STEPS[0]

  return (
    <D.Root
      open={open}
      onOpenChange={(next) => {
        if (next) return
        dismiss(reason.current)
        reason.current = "dismiss"
      }}
    >
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[100] bg-ink-950/85 backdrop-blur-md" />
        {/* Centred by auto margins rather than a transform, so the entrance
            clip-wipe can carry its own transform without fighting it. */}
        <D.Content
          onEscapeKeyDown={() => (reason.current = "escape")}
          onPointerDownOutside={() => (reason.current = "backdrop")}
          /* Radix focuses the first control on open, which here is Close — the
             one thing we are not inviting. Focus the panel instead, so both a
             screen reader and a Tab start at the question. */
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            e.currentTarget instanceof HTMLElement && e.currentTarget.focus()
          }}
          className="rise fixed inset-0 z-[101] m-auto h-fit max-h-[100dvh] w-full max-w-[560px] overflow-y-auto border border-edge bg-ink-950 px-6 py-7 sm:px-10 sm:py-9"
        >
          <div className="border-b border-edge pb-4">
            <span className="font-mono text-micro uppercase tracking-[0.22em] text-fg">NewEra</span>
          </div>

          <div className="mt-5 flex items-baseline justify-between font-mono text-micro uppercase tracking-[0.14em] text-fg-dim">
            <span>{s.label}</span>
            <span>
              {String(Math.min(step, 2) + 1).padStart(2, "0")} <span className="text-fg-dim/50">/</span> 03
            </span>
          </div>
          {/* Three hairlines rather than three dots — the same rule the aperture
              draws, filling as the flow advances. */}
          <div aria-hidden className="mt-2.5 flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-px flex-1 transition-colors duration-300 ${
                  i <= Math.min(step, 2) ? "bg-acid-500" : "bg-edge-strong"
                }`}
              />
            ))}
          </div>

          <D.Title
            className="mt-7 font-display text-3xl font-bold text-fg"
            style={{ fontStretch: "84%" }}
          >
            {s.title}
          </D.Title>
          {/* No .measure here or below: the panel is 560px, which is already
              inside the comfortable range, and a 42ch clamp on top of it leaves
              short ragged columns floating in a wide box. */}
          <D.Description className="mt-3 text-sm leading-relaxed text-fg-muted">
            {s.sub}
          </D.Description>

          {/* Each step is uncovered rather than swapped in. */}
          <div key={step} className="rise mt-8">
            {step === 0 && (
              <>
                <div className="border-t border-edge">
                  {INTENTS.map((o, i) => (
                    <ScanRow
                      key={o.id}
                      index={String(i + 1).padStart(2, "0")}
                      title={o.name}
                      note={o.desc}
                      selected={intent === o.id}
                      onClick={() => {
                        setIntent(o.id)
                        localStorage.setItem(K_INTENT, o.id)
                      }}
                    />
                  ))}
                </div>
                <Actions
                  primary="Continue"
                  disabled={!intent}
                  onPrimary={() => {
                    track("INTENT_SELECTED", { intent })
                    setStep(1)
                  }}
                  skip="Skip this"
                  onSkip={() => {
                    track("INTENT_SELECTED", { intent: null, skipped: true })
                    setStep(1)
                  }}
                />
              </>
            )}

            {step === 1 && (
              <>
                <div className="border-t border-edge">
                  {WALLETS.map((w, i) => (
                    <ScanRow
                      key={w.kind}
                      index={String(i + 1).padStart(2, "0")}
                      title={w.title}
                      note={w.note}
                      disabled={busy}
                      onClick={() => doConnect(w.kind)}
                      arrow
                    />
                  ))}
                </div>
                <Msg msg={msg} />
                <Actions skip="I'll do this later" onSkip={() => dismiss("later")} />
              </>
            )}

            {step === 2 && (
              <>
                {/* The address resolves out of noise — the one gesture this
                    product is about, applied to the visitor's own key. */}
                <div className="border-l border-acid-500 pl-4">
                  <span className="font-mono text-micro uppercase tracking-[0.14em] text-acid-500">
                    Connected
                  </span>
                  <Resolve
                    text={addr ?? ""}
                    className="mt-1.5 block break-all font-mono text-sm text-fg"
                  />
                </div>
                <p className="mt-7 text-sm leading-relaxed text-fg-muted">
                  Want alerts? We only message you about things you asked to follow. Skip and
                  everything still works.
                </p>
                <Field
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@domain.com"
                  type="email"
                  onEnter={saveContact}
                />
                <Field
                  label="Telegram — optional"
                  value={tg}
                  onChange={setTg}
                  placeholder="@handle"
                  onEnter={saveContact}
                />
                <Msg msg={msg} />
                <Actions
                  primary={busy ? "Saving…" : "Save & continue"}
                  disabled={busy}
                  onPrimary={saveContact}
                  skip="Skip — take me in"
                  onSkip={() => {
                    track("CONTACT_SKIPPED")
                    finish()
                  }}
                />
              </>
            )}

            {step === 3 && (
              <>
                <p className="text-sm leading-relaxed text-fg-muted">
                  We sent it to <b className="font-semibold text-fg">{email}</b>.
                </p>
                <label className="mt-6 block">
                  <span className="font-mono text-micro uppercase tracking-[0.14em] text-fg-dim">
                    Code
                  </span>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    className="mt-2 w-full border-b border-edge-strong bg-transparent pb-2.5 font-mono text-2xl tracking-[0.4em] text-fg outline-none transition-colors placeholder:text-fg-dim focus:border-acid-500"
                  />
                </label>
                <Msg msg={msg} />
                <Actions
                  primary={busy ? "Verifying…" : "Verify"}
                  disabled={busy}
                  onPrimary={verifyCode}
                  skip="Skip for now"
                  onSkip={() => {
                    track("CONTACT_SKIPPED", { at: "code" })
                    finish()
                  }}
                />
              </>
            )}
          </div>

          {/* text-xs, not text-micro: 11px is the floor for a *label*, and this
              is a sentence someone is being asked to agree to. */}
          <p className="mt-9 border-t border-edge pt-5 font-mono text-xs leading-relaxed text-fg-dim">
            By continuing you agree to our{" "}
            <Link to="/terms" viewTransition className="scan-link">
              Terms
            </Link>{" "}
            and{" "}
            <Link to="/privacy" viewTransition className="scan-link">
              Privacy Policy
            </Link>
            .
          </p>

          {/* Last in the DOM, first in the corner. Radix and most dialogs put
              close first, which means the opening Tab of the flow offers the way
              out before the question — so it sits where it looks like it sits,
              and the keyboard reaches the choices first. */}
          {/* Positioned by a wrapper: .scan-link sets position:relative and is
              declared after Tailwind's utilities, so `absolute` on the link
              itself loses the cascade and it lands back in the flow. */}
          <span className="absolute right-6 top-7 sm:right-10 sm:top-9">
            <D.Close
              onClick={() => (reason.current = "close-button")}
              className="scan-link font-mono text-micro uppercase tracking-[0.14em]"
            >
              Close
            </D.Close>
          </span>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

/* ---- the pieces, all in the site's own vocabulary ---- */

/** An underline rather than a filled box — the field is a rule you write on. */
function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  onEnter,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  type?: string
  onEnter?: () => void
}) {
  return (
    <label className="mt-6 block">
      <span className="font-mono text-micro uppercase tracking-[0.14em] text-fg-dim">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder={placeholder}
        type={type}
        spellCheck={false}
        className="mt-2 w-full border-b border-edge-strong bg-transparent pb-2.5 font-mono text-sm text-fg outline-none transition-colors placeholder:text-fg-dim focus:border-acid-500"
      />
    </label>
  )
}

/** The action and its escape hatch on one line: a block that seats when
 *  pressed, and a link that draws its rule. No pills. */
function Actions({
  primary,
  onPrimary,
  disabled,
  skip,
  onSkip,
}: {
  primary?: string
  onPrimary?: () => void
  disabled?: boolean
  skip: string
  onSkip: () => void
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      {primary ? (
        <button
          type="button"
          onClick={onPrimary}
          disabled={disabled}
          /* Unavailable is an outline, not a faded fill. Lime at 40% over black
             puts the black label at roughly 3:1 — the state that most needs to
             be read clearly was the least readable thing on the panel. An
             unfilled block with fg-dim reads as "not yet" at 5.24:1, and it is
             the same vocabulary as the feed's inactive toggles. */
          className="block-btn bg-acid-500 font-semibold text-ink-950 disabled:cursor-not-allowed disabled:border disabled:border-edge-strong disabled:bg-transparent disabled:text-fg-dim"
        >
          {primary}
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={onSkip}
        className="scan-link font-mono text-micro uppercase tracking-[0.14em]"
      >
        {skip}
      </button>
    </div>
  )
}

function Msg({ msg }: { msg: { text: string; kind?: "err" | "ok" } | null }) {
  if (!msg) return <div className="min-h-[18px]" />
  return (
    <div
      role="status"
      className={`mt-5 min-h-[18px] font-mono text-micro leading-relaxed ${
        msg.kind === "err" ? "text-danger" : msg.kind === "ok" ? "text-acid-500" : "text-fg-muted"
      }`}
    >
      {msg.text}
    </div>
  )
}

/** Settles a string out of scramble, once, on mount. `ResolveText` in
 *  `kinetic.tsx` does this on a ScrollTrigger, which never fires inside a fixed
 *  dialog — the string is already in view the moment it exists. */
function Resolve({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !text) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const tw = gsap.to(el, {
      duration: 0.9,
      scrambleText: { text, chars: "0123456789abcdef", speed: 0.8, revealDelay: 0.1 },
      ease: "none",
    })
    return () => {
      tw.kill()
      el.textContent = text
    }
  }, [text])

  return (
    <span className={className}>
      {/* The real string is always in the DOM; only the aria-hidden copy scrambles. */}
      <span className="sr-only">{text}</span>
      <span ref={ref} aria-hidden>
        {text}
      </span>
    </span>
  )
}
