import { useCallback, useEffect, useRef, useState } from "react"
import { API, authHeaders } from "@/lib/api"
import { anonId, track, K_DONE, K_DECLINED, K_INTENT } from "@/lib/onboarding"
import type { Intent } from "@/lib/onboarding"
import { connect, isRejection, currentAddress } from "@/lib/wallet"
import type { ConnectKind } from "@/lib/wallet"

/* Flow: intent → wallet → optional contact → optional email code.
 *
 * Intent is asked BEFORE the wallet prompt on purpose. It costs one tap and no
 * popup, so we still learn why someone came even if they abandon at the
 * signature — which is where crypto onboarding actually loses people. */

const INTENTS: { id: Intent; emoji: string; name: string; desc: string }[] = [
  { id: "TRADE", emoji: "📈", name: "Trade", desc: "Find and trade tokens" },
  { id: "LAUNCH", emoji: "🚀", name: "Launch", desc: "Deploy my own token" },
  { id: "CREATE", emoji: "🎨", name: "Create", desc: "Build on the data" },
  { id: "EXPLORE", emoji: "👀", name: "Just looking", desc: "Show me around" },
]

const HEADINGS = [
  { title: "Welcome to NewEra", sub: "Two quick steps and you're in." },
  { title: "Almost there", sub: "Your wallet is your account — nothing else to remember." },
  { title: "You're in", sub: "One optional extra, then straight to the feed." },
  { title: "Confirm your email", sub: "Last step — this one's quick." },
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
  const cardRef = useRef<HTMLDivElement>(null)
  const lastFocus = useRef<Element | null>(null)

  // Open: restore any earlier answer, pick the right starting step, and record it.
  useEffect(() => {
    if (!open) return
    lastFocus.current = document.activeElement
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
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
      if (lastFocus.current instanceof HTMLElement) lastFocus.current.focus()
    }
  }, [open])

  const dismiss = useCallback(
    (reason: string) => {
      track("MODAL_DISMISSED", { at: ["intent", "wallet", "contact", "code"][step], reason })
      // Remember the decline, or the next cluster page asks again.
      try {
        localStorage.setItem(K_DECLINED, String(Date.now()))
      } catch {
        // Private mode with storage disabled: the modal reappearing is a far
        // smaller problem than a thrown error taking the page down.
      }
      onClose(reason)
    },
    [step, onClose],
  )

  // Escape to close, and keep focus inside while it's open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return dismiss("escape")
      if (e.key !== "Tab" || !cardRef.current) return
      const f = cardRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input, a[href]",
      )
      const vis = [...f].filter((n) => n.offsetParent !== null)
      if (!vis.length) return
      const first = vis[0]
      const last = vis[vis.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, dismiss])

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

  if (!open) return null
  const h = HEADINGS[step] ?? HEADINGS[0]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nwo-title"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/72 p-5 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && dismiss("backdrop")}
    >
      <div
        ref={cardRef}
        className="relative max-h-[calc(100vh-40px)] w-[min(440px,100%)] overflow-y-auto rounded-3xl border border-edge bg-gradient-to-b from-ink-850 to-ink-900 p-7 shadow-[0_40px_100px_-30px_rgba(0,0,0,.9)]"
      >
        <button
          onClick={() => dismiss("close-button")}
          aria-label="Close"
          className="absolute right-5 top-5 rounded-lg px-2 py-1 text-2xl leading-none text-fg-dim transition-colors hover:bg-white/[.06] hover:text-fg"
        >
          ×
        </button>

        <div className="mb-5 text-center">
          <div className="mx-auto mb-4 grid h-[54px] w-[54px] place-items-center rounded-2xl border border-acid-500/28 bg-acid-500/10">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#cdff4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l2.4 6.2L21 10l-5 4.3L17.5 21 12 17.6 6.5 21 8 14.3 3 10l6.6-1.8z" />
            </svg>
          </div>
          <h3 id="nwo-title" className="font-display text-xl font-bold tracking-[-0.01em]">
            {h.title}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{h.sub}</p>
        </div>

        <div className="mb-6 flex justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-[3px] w-[22px] rounded-full transition-colors ${i <= step ? "bg-acid-500" : "bg-white/12"}`}
            />
          ))}
        </div>

        {/* 1 — intent */}
        {step === 0 && (
          <>
            <Label>What brings you here?</Label>
            <div className="mb-5 grid grid-cols-2 gap-2.5">
              {INTENTS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={intent === o.id}
                  onClick={() => {
                    setIntent(o.id)
                    localStorage.setItem(K_INTENT, o.id)
                  }}
                  className={`flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-colors ${
                    intent === o.id
                      ? "border-acid-500/60 bg-acid-500/[.09]"
                      : "border-edge bg-white/[.03] hover:border-edge-strong hover:bg-white/[.06]"
                  }`}
                >
                  <span className="text-xl leading-none">{o.emoji}</span>
                  <span className="text-sm font-semibold leading-tight">{o.name}</span>
                  <span className="text-xs leading-tight text-fg-dim">{o.desc}</span>
                </button>
              ))}
            </div>
            <Primary disabled={!intent} onClick={() => { track("INTENT_SELECTED", { intent }); setStep(1) }}>
              Continue
            </Primary>
            <Skip onClick={() => { track("INTENT_SELECTED", { intent: null, skipped: true }); setStep(1) }}>
              Skip this
            </Skip>
          </>
        )}

        {/* 2 — wallet */}
        {step === 1 && (
          <>
            <Label>Connect your wallet</Label>
            <p className="mb-4 text-xs leading-relaxed text-fg-dim">
              Your wallet is your account — no password, no email required. Signing proves the
              address is yours; it authorises no transaction.
            </p>
            <WalletButton onClick={() => doConnect("metamask")} disabled={busy} accent={false}
              title="MetaMask" sub="Browser extension" />
            <WalletButton onClick={() => doConnect("walletconnect")} disabled={busy} accent
              title="WalletConnect" sub="Trust, OKX, Binance & mobile" />
            <Msg msg={msg} />
            <Skip onClick={() => dismiss("later")}>I&apos;ll do this later</Skip>
          </>
        )}

        {/* 3 — optional contact */}
        {step === 2 && (
          <>
            <div className="text-center">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full border border-acid-500/40 bg-acid-500/12">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#cdff4d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <div className="mb-4 break-all rounded-xl border border-acid-500/20 bg-acid-500/[.07] px-3 py-2.5 font-mono text-sm text-acid-500">
                {addr}
              </div>
            </div>
            <Label>Want alerts? (optional)</Label>
            <p className="mb-3 text-xs leading-relaxed text-fg-dim">
              We&apos;ll only message you about things you asked to follow. Skip and everything still works.
            </p>
            <Input value={email} onChange={setEmail} placeholder="Email address" type="email" onEnter={saveContact} />
            <Input value={tg} onChange={setTg} placeholder="Telegram @handle (optional)" onEnter={saveContact} />
            <Primary disabled={busy} onClick={saveContact}>
              {busy ? "Saving…" : "Save & continue"}
            </Primary>
            <Msg msg={msg} />
            <Skip onClick={() => { track("CONTACT_SKIPPED"); finish() }}>Skip — take me in</Skip>
          </>
        )}

        {/* 4 — email code */}
        {step === 3 && (
          <>
            <Label>Check your inbox</Label>
            <p className="mb-3 text-xs leading-relaxed text-fg-dim">
              We sent a 6-digit code to <b className="text-fg">{email}</b>. It expires in 15 minutes.
            </p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && verifyCode()}
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              autoComplete="one-time-code"
              className="mb-3 w-full rounded-xl border border-edge-strong bg-white/[.04] px-4 py-3.5 text-center font-mono text-xl tracking-[0.35em] text-fg outline-none transition-colors focus:border-acid-500/55"
            />
            <Primary disabled={busy} onClick={verifyCode}>
              {busy ? "Verifying…" : "Verify"}
            </Primary>
            <Msg msg={msg} />
            <Skip onClick={() => { track("CONTACT_SKIPPED", { at: "code" }); finish() }}>Skip for now</Skip>
          </>
        )}

        <p className="mt-5 border-t border-edge pt-4 text-center text-xs leading-relaxed text-fg-dim">
          By continuing you agree to our{" "}
          <a href="/terms" className="underline hover:text-fg-dim">Terms</a> and{" "}
          <a href="/privacy" className="underline hover:text-fg-dim">Privacy Policy</a>.
        </p>
      </div>
    </div>
  )
}

/* ---- small pieces ---- */

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-3 block text-sm font-semibold text-fg">{children}</span>
}

function Primary({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl bg-acid-500 py-3.5 text-base font-bold text-[#0a0d05] transition-[filter,opacity] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  )
}

function Skip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 block w-full pb-0.5 text-sm text-fg-dim transition-colors hover:text-fg-muted"
    >
      {children}
    </button>
  )
}

function Msg({ msg }: { msg: { text: string; kind?: "err" | "ok" } | null }) {
  if (!msg) return <div className="min-h-[18px]" />
  return (
    <div
      className={`mt-3 min-h-[18px] text-center text-sm leading-relaxed ${
        msg.kind === "err" ? "text-danger" : msg.kind === "ok" ? "text-acid-500" : "text-fg-muted"
      }`}
    >
      {msg.text}
    </div>
  )
}

function Input({
  value, onChange, placeholder, type = "text", onEnter,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  type?: string
  onEnter?: () => void
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
      placeholder={placeholder}
      type={type}
      spellCheck={false}
      className="mb-3 w-full rounded-xl border border-edge-strong bg-white/[.04] px-4 py-3.5 text-sm text-fg outline-none transition-colors placeholder:text-fg-dim focus:border-acid-500/55"
    />
  )
}

function WalletButton({
  onClick, disabled, accent, title, sub,
}: {
  onClick: () => void
  disabled?: boolean
  accent?: boolean
  title: string
  sub: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mb-3 flex w-full items-center gap-4 rounded-2xl border px-4 py-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        accent
          ? "border-acid-500/28 bg-acid-500/[.06] hover:border-acid-500/60 hover:bg-acid-500/10"
          : "border-edge bg-white/[.03] hover:border-edge-strong hover:bg-white/[.06]"
      }`}
    >
      <span className={`grid h-10 w-10 flex-none place-items-center rounded-xl ${accent ? "bg-acid-500/12" : "bg-white/10"}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={accent ? "#cdff4d" : "#f5f7fa"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {accent ? (
            <>
              <path d="M6 12a6 6 0 0 1 12 0M9 12a3 3 0 0 1 6 0" />
              <circle cx="12" cy="12" r="1" fill="#cdff4d" stroke="none" />
            </>
          ) : (
            <>
              <rect x="3" y="6" width="18" height="13" rx="2.5" />
              <path d="M3 10.5h18" />
            </>
          )}
        </svg>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-base font-semibold leading-tight">{title}</span>
        <span className="text-xs leading-tight text-fg-dim">{sub}</span>
      </span>
    </button>
  )
}
