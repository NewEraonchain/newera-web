import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { API, authHeaders, shortAddr } from "@/lib/api"
import { currentAddress, hasSession, disconnect } from "@/lib/wallet"
import { EmptyState } from "@/components/intel"

type Me = {
  walletAddress: string
  ownerAddress?: string | null
  chainId?: number | null
  intent?: string | null
  email?: string | null
  emailVerifiedAt?: string | null
  telegramHandle?: string | null
  xHandle?: string | null
  createdAt?: string | null
  sessionCount?: number | null
  walletProfile?: { walletAgeDays?: number | null; txCount?: number | null } | null
}

/* Lists every field stored against the wallet rather than a curated subset.
   We collect onboarding answers and derive a profile from public chain history;
   a person should be able to see all of it without having to ask. */
export default function Account() {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ text: string; kind?: "err" | "ok" } | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [erased, setErased] = useState(false)

  const addr = currentAddress()

  const load = useCallback(() => {
    if (!addr) return setLoading(false)
    if (!hasSession()) {
      setMe({ walletAddress: addr })
      return setLoading(false)
    }
    fetch(`${API}/onboarding/me`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setMe(d.user || { walletAddress: addr }))
      // Session expired or API down — show what the browser knows rather than
      // an error, since the address itself is still valid.
      .catch(() => setMe({ walletAddress: addr }))
      .finally(() => setLoading(false))
  }, [addr])

  useEffect(() => {
    load()
  }, [load])

  async function exportData() {
    setBusy(true)
    setMsg({ text: "Preparing your file…" })
    try {
      const r = await fetch(`${API}/onboarding/export`, { headers: authHeaders() })
      if (!r.ok) throw new Error(`Could not build the export (HTTP ${r.status}).`)
      const data = await r.json()
      // Built client-side so the file never touches a third party.
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `newera-export-${data.account?.walletAddress || "account"}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setMsg({ text: "Downloaded.", kind: "ok" })
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Export failed.", kind: "err" })
    } finally {
      setBusy(false)
    }
  }

  async function clearContact() {
    setBusy(true)
    try {
      const r = await fetch(`${API}/onboarding/contact/clear`, {
        method: "POST",
        headers: authHeaders(),
      })
      if (!r.ok) throw new Error("Could not remove contact details.")
      setMsg({ text: "Contact details removed. Your account is unchanged otherwise.", kind: "ok" })
      load()
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed.", kind: "err" })
    } finally {
      setBusy(false)
    }
  }

  async function erase() {
    if (confirmText.trim() !== "DELETE") {
      return setMsg({ text: "Type DELETE exactly to confirm.", kind: "err" })
    }
    setBusy(true)
    setMsg({ text: "Erasing…" })
    try {
      const r = await fetch(`${API}/onboarding/me`, {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ confirm: "DELETE" }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Deletion failed.")
      // Clear the browser too — including the visitor id, so the anonymised
      // rows left behind cannot be re-linked to this person.
      ;["newera_token", "newera_address", "newera_owner", "newera_anon_id", "newera_onboarded", "newera_intent"]
        .forEach((k) => localStorage.removeItem(k))
      setErased(true)
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Deletion failed.", kind: "err" })
      setBusy(false)
    }
  }

  if (erased) {
    return (
      <Wrap>
        <EmptyState>
          <p className="mb-2 text-[15px] font-semibold text-fg">Your data has been deleted.</p>
          <p className="mb-5">
            Nothing is left on our side. Anything recorded on the public blockchain is not ours and
            remains there.
          </p>
          <Link to="/app" className="inline-block rounded-xl bg-acid-500 px-5 py-3 text-[14px] font-bold text-[#0a0d05]">
            Back to the feed
          </Link>
        </EmptyState>
      </Wrap>
    )
  }

  if (loading) return <Wrap><EmptyState>Loading…</EmptyState></Wrap>

  if (!addr) {
    return (
      <Wrap>
        <EmptyState>
          <p className="mb-2 text-[15px] font-semibold text-fg">No wallet connected</p>
          <p className="mb-5">
            The live feed works without one. Connect only if you want preferences saved against your
            address.
          </p>
          <Link to="/app" className="inline-block rounded-xl bg-acid-500 px-5 py-3 text-[14px] font-bold text-[#0a0d05]">
            Back to the feed
          </Link>
        </EmptyState>
      </Wrap>
    )
  }

  const rows: [string, React.ReactNode, string?][] = [
    ["Wallet address", me?.walletAddress, "your account identifier"],
    ["Signing wallet", me?.ownerAddress ? shortAddr(me.ownerAddress) : null, "the address that signed in"],
    ["Chain", me?.chainId, undefined],
    ["Why you came", me?.intent, "what you picked during onboarding"],
    ["Email", me?.email, me?.emailVerifiedAt ? "verified" : "not verified"],
    ["Telegram", me?.telegramHandle ? `@${me.telegramHandle}` : null, undefined],
    ["X / Twitter", me?.xHandle ? `@${me.xHandle}` : null, undefined],
    ["First seen", me?.createdAt ? new Date(me.createdAt).toLocaleString() : null, undefined],
    ["Visits", me?.sessionCount, "how many times you have signed in"],
    ["Wallet age", me?.walletProfile?.walletAgeDays != null ? `${me.walletProfile.walletAgeDays} days` : null, "derived from public chain history"],
    ["Transactions", me?.walletProfile?.txCount, "derived from public chain history"],
  ]
  const set = rows.filter(([, v]) => v !== null && v !== undefined && v !== "").length

  return (
    <Wrap>
      <h1 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-bold tracking-[-0.02em]">Account</h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-fg-muted">
        NewEra is free and needs no account to use. A wallet only matters once you want something
        remembered.
      </p>

      <Section title="Wallet">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-edge bg-white/[.022] px-4 py-3">
          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-[#c8cdd6]">{addr}</span>
          <Btn onClick={() => navigator.clipboard.writeText(addr)}>Copy</Btn>
          <Btn onClick={() => { disconnect(); location.reload() }}>Disconnect</Btn>
        </div>
      </Section>

      <Section title="What we hold against this wallet" note={`${set} of ${rows.length} fields set`}>
        <div className="flex flex-col gap-2">
          {rows.map(([label, value, hint]) => {
            const empty = value === null || value === undefined || value === ""
            return (
              <div key={label} className="flex items-center gap-3 rounded-xl border border-edge bg-white/[.022] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[#c8cdd6]">{label}</div>
                  {hint && <div className="mt-0.5 text-[11.5px] text-fg-dim">{hint}</div>}
                </div>
                <span className={`flex-none truncate text-[12.5px] ${empty ? "text-fg-dim" : "font-mono text-fg"}`}>
                  {empty ? "not set" : String(value)}
                </span>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-fg-dim">
          On-chain activity shown throughout the feed comes from the public blockchain and exists
          whether or not you use NewEra. The rows above are only what this site stores.
        </p>
      </Section>

      <Section title="Your data">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-edge bg-white/[.022] px-4 py-3">
          <span className="min-w-[220px] flex-1 text-[13px] text-[#c8cdd6]">
            Download everything we hold, or remove the optional contact details while keeping the account.
          </span>
          <Btn onClick={exportData} disabled={busy}>Download my data</Btn>
          <Btn onClick={clearContact} disabled={busy}>Remove contact details</Btn>
        </div>
        {msg && (
          <p className={`mt-3 text-[13px] ${msg.kind === "err" ? "text-danger" : msg.kind === "ok" ? "text-acid-500" : "text-fg-muted"}`}>
            {msg.text}
          </p>
        )}
      </Section>

      <Section title="Delete everything">
        <div className="rounded-2xl border border-danger/25 bg-danger/[.04] p-5">
          <p className="mb-2 text-[14px] leading-relaxed text-fg-muted">
            This erases your NewEra record permanently: onboarding answers, contact details, session
            history and the cached summary of your wallet. It cannot be undone.
          </p>
          <p className="mb-4 text-[12.5px] leading-relaxed text-fg-dim">
            Activity recorded on the public blockchain is not ours and cannot be deleted by anyone,
            including us.
          </p>
          {!confirming ? (
            <Btn danger onClick={() => setConfirming(true)}>Delete my account</Btn>
          ) : (
            <div>
              <p className="mb-2.5 text-[13px] text-danger">
                Type <b>DELETE</b> to confirm. There is no undo.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  spellCheck={false}
                  className="w-[200px] rounded-xl border border-edge-strong bg-white/[.04] px-3.5 py-2.5 text-[13px] outline-none focus:border-danger/55"
                />
                <Btn danger onClick={erase} disabled={busy}>Erase permanently</Btn>
                <Btn onClick={() => { setConfirming(false); setConfirmText(""); setMsg(null) }}>Cancel</Btn>
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Not built yet">
        <EmptyState>
          Watchlists and alerts don&apos;t exist yet. When they do they will attach to this wallet,
          which is the only real reason to connect one.
        </EmptyState>
      </Section>
    </Wrap>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl px-5 pb-28 pt-12">{children}</div>
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[15px] font-bold">{title}</h2>
        {note && <span className="text-[12px] text-fg-dim">{note}</span>}
      </div>
      {children}
    </section>
  )
}

function Btn({ children, onClick, disabled, danger }: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-3.5 py-2 text-[13px] font-medium transition-colors disabled:opacity-50 ${
        danger
          ? "border-danger/40 text-danger hover:border-danger/70 hover:bg-danger/10"
          : "border-edge bg-white/[.03] text-fg-muted hover:border-edge-strong hover:text-fg"
      }`}
    >
      {children}
    </button>
  )
}
