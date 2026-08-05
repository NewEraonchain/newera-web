import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { API, authHeaders, shortAddr } from "@/lib/api"
import { currentAddress, hasSession, disconnect, connect, isRejection } from "@/lib/wallet"
import type { ConnectKind } from "@/lib/wallet"
import { anonId } from "@/lib/onboarding"
import { EmptyState } from "@/components/intel"
import { Page } from "@/components/shell"
import { ScanRow, WALLETS } from "@/components/rows"

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

/* What this page shows, and what it does not.
 *
 * The rows below are the fields `/onboarding/me` returns — the ones a person
 * gave us or that we derived about them. They are NOT every column stored
 * against the wallet: the User row also carries a referral code, reward flags,
 * timestamps, and rows in tables left over from a retired product. This file
 * used to claim it listed all of it, which was 13 fields of roughly 30.
 *
 * "Download my data" is the complete record — `exportUserData` returns the
 * whole User row plus every related table — so the honest arrangement is that
 * this page summarises and the export is exhaustive, with the page saying which
 * is which rather than overstating itself. */
export default function Account() {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ text: string; kind?: "err" | "ok" } | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [erased, setErased] = useState(false)
  /** Set when the record could not be read, so the page never presents an
      unknown record as an empty one. */
  const [stale, setStale] = useState<"expired" | "unreachable" | null>(null)

  const addr = currentAddress()

  const load = useCallback(() => {
    if (!addr) return setLoading(false)
    if (!hasSession()) {
      setMe({ walletAddress: addr })
      return setLoading(false)
    }
    /* A failure here must never be rendered as an empty record.
     *
     * This used to fall back to `{ walletAddress: addr }` on any error, which
     * on a page headed "What we hold against this wallet" printed "1 of 11
     * fields set" with every row reading "not set" — a false and flattering
     * disclosure produced by an outage or an expired token. Tokens last seven
     * days and `newera_address` is never cleared, so every returning user past
     * day 7 landed in exactly that state, with all three data-rights buttons
     * failing silently against a 401.
     *
     * So the two cases are separated: an expired session is reported as one and
     * the connect rows come back; a transport failure says so and leaves the
     * record unknown rather than empty. */
    fetch(`${API}/onboarding/me`, { headers: authHeaders() })
      .then(async (r) => {
        if (r.ok) return r.json()
        if (r.status === 401 || r.status === 403) {
          throw Object.assign(new Error("expired"), { expired: true })
        }
        throw new Error(`HTTP ${r.status}`)
      })
      .then((d) => setMe(d.user || { walletAddress: addr }))
      .catch((e: { expired?: boolean }) => {
        if (e?.expired) {
          // Drop the dead token so the page offers a way back in.
          localStorage.removeItem("newera_token")
          setStale("expired")
        } else {
          setStale("unreachable")
        }
      })
      .finally(() => setLoading(false))
  }, [addr])

  useEffect(() => {
    load()
  }, [load])

  /* The only connect entry point on the site outside the onboarding dialog —
     and that dialog remembers a decline for thirty days, so without this there
     was no way to connect at all in between. */
  async function doConnect(kind: ConnectKind) {
    setBusy(true)
    setMsg({ text: "Approve the signature in your wallet…" })
    try {
      await connect(kind, { anonId: anonId() })
      // Everything on this page keys off currentAddress(); a reload is how the
      // disconnect button already re-reads it.
      location.reload()
    } catch (e) {
      setMsg({
        text: isRejection(e)
          ? "Signature cancelled — no problem, try again when ready."
          : e instanceof Error
            ? e.message
            : "Connection failed.",
        kind: "err",
      })
      setBusy(false)
    }
  }

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
      /* `body: "{}"` is load-bearing. `authHeaders()` always sets
         Content-Type: application/json, and Fastify's JSON parser rejects an
         empty body with FST_ERR_CTP_EMPTY_JSON_BODY *before* the auth
         preHandler runs — so this returned 400 for every user who ever pressed
         it, and the control backing the privacy policy's withdrawal commitment
         has never once worked. */
      const r = await fetch(`${API}/onboarding/contact/clear`, {
        method: "POST",
        headers: authHeaders(),
        body: "{}",
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
          <p className="mb-2 text-base font-semibold text-fg">Your data has been deleted.</p>
          <p className="measure mb-5">
            {/* "Nothing is left on our side" is stronger than what the delete
                actually does — it removes the account and its related rows, and
                operational traces (request logs, backups on their own rotation)
                are not a table we can drop in a transaction. Claiming total
                erasure on a page about honesty is the wrong place to round up. */}
            Your account and everything linked to it has been deleted from our database. Ordinary
            operational records — request logs, and backups until they rotate — are not part of
            that and expire on their own schedule. Anything recorded on the public blockchain is
            not ours and remains there.
          </p>
          <Link to="/app" className="block-btn bg-acid-500 text-ink-950">
            Back to the feed
          </Link>
        </EmptyState>
      </Wrap>
    )
  }

  if (loading) return <Wrap><EmptyState>Loading…</EmptyState></Wrap>

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

  /* Disconnected is the state most visitors are in, and it used to be a
     three-line empty state on an otherwise blank page — with no way to connect
     from anywhere on the site once the onboarding dialog had been dismissed.
     It now answers the only question worth answering here: what would this cost
     me. Same field list as the connected view, every row reading "not set",
     shown *before* connecting rather than after. */
  /* An unreadable record is not an empty one. Showing the disconnected view
     with an explanation is the honest option: the connect rows below give a way
     back in, which the old silent fallback did not — its only affordance was
     "Disconnect". */
  if (!addr || stale) {
    return (
      <Wrap>
        <h1 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-bold tracking-[-0.02em]">Account</h1>
        {stale === "expired" ? (
          <p className="measure mt-2 text-sm leading-relaxed text-warn">
            Your session expired, so we cannot show your record. Nothing has been deleted —
            reconnect the same wallet and it will all still be there.
          </p>
        ) : stale === "unreachable" ? (
          <p className="measure mt-2 text-sm leading-relaxed text-warn">
            We could not reach the API, so we cannot show what is held against this wallet. This is
            a connection problem, not an empty record — try again in a moment.
          </p>
        ) : (
          <p className="measure mt-2 text-sm leading-relaxed text-fg-muted">
            NewEra needs no account. The feed, the clusters and the API are open to everyone. A
            wallet only changes what can be remembered — so here is exactly what that would be.
          </p>
        )}

        <Section title="Connect a wallet">
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
          {msg && (
            <p className={`mt-4 font-mono text-micro ${msg.kind === "err" ? "text-danger" : "text-fg-muted"}`}>
              {msg.text}
            </p>
          )}
          <p className="measure mt-4 text-xs leading-relaxed text-fg-dim">
            Signing proves the address is yours. It authorises no transaction and moves nothing —
            NewEra holds no keys and has never signed one.
          </p>
        </Section>

        <Section title="What would be held against your wallet" note={`${rows.length} fields, none set`}>
          <Fields rows={rows} />
        </Section>

        <Section title="What is never held">
          <ul className="flex flex-col">
            {[
              ["Private keys", "you sign in your own wallet; nothing leaves it"],
              ["Funds", "NewEra cannot move a token, and has no contract that could"],
              ["Your browsing outside this site", "no third-party analytics, no ad network"],
              ["Your on-chain history", "it is public, it is the chain's, and it exists whether or not you use NewEra"],
            ].map(([label, note]) => (
              <li key={label} className="flex flex-wrap items-baseline gap-x-4 border-b border-edge py-3">
                <span className="text-sm font-semibold text-fg">{label}</span>
                {/* text-xs: these are sentences, and 11px is the floor for a
                    label, not for something a reader has to parse. */}
                <span className="font-mono text-xs text-fg-dim">{note}</span>
              </li>
            ))}
          </ul>
        </Section>

        <div className="mt-9">
          <Link to="/app" className="block-btn bg-acid-500 text-ink-950">
            Back to the feed
          </Link>
        </div>
      </Wrap>
    )
  }

  return (
    <Wrap>
      <h1 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-bold tracking-[-0.02em]">Account</h1>
      <p className="measure mt-2 text-sm leading-relaxed text-fg-muted">
        NewEra is free and needs no account to use. A wallet only matters once you want something
        remembered.
      </p>

      <Section title="Wallet">
        <div className="flex flex-wrap items-center gap-3 border-y border-edge py-4">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{addr}</span>
          <Btn onClick={() => navigator.clipboard.writeText(addr)}>Copy</Btn>
          <Btn onClick={() => { disconnect(); location.reload() }}>Disconnect</Btn>
        </div>
      </Section>

      <Section title="What we hold against this wallet" note={`${set} of ${rows.length} fields set`}>
        <Fields rows={rows} />
        <p className="mt-3 text-xs leading-relaxed text-fg-dim">
          These are the fields you gave us or that we derived about you. They are a summary, not
          the whole record — internal columns like a referral code and timestamps are held too, and
          <b className="font-semibold text-fg-muted"> Download my data</b> below returns every one
          of them, from every table. On-chain activity shown throughout the feed comes from the
          public blockchain and exists whether or not you use NewEra.
        </p>
      </Section>

      <Section title="Your data">
        <div className="flex flex-wrap items-center gap-3 border-y border-edge py-4">
          <span className="min-w-[220px] flex-1 text-sm text-fg">
            Download everything we hold, or remove the optional contact details while keeping the account.
          </span>
          <Btn onClick={exportData} disabled={busy}>Download my data</Btn>
          <Btn onClick={clearContact} disabled={busy}>Remove contact details</Btn>
        </div>
        {msg && (
          <p className={`mt-3 text-sm ${msg.kind === "err" ? "text-danger" : msg.kind === "ok" ? "text-acid-500" : "text-fg-muted"}`}>
            {msg.text}
          </p>
        )}
      </Section>

      <Section title="Delete everything">
        <div className="border-l border-danger/60 pl-5">
          <p className="mb-2 text-sm leading-relaxed text-fg-muted">
            This erases your NewEra record permanently: onboarding answers, contact details, session
            history and the cached summary of your wallet. It cannot be undone.
          </p>
          <p className="mb-4 text-xs leading-relaxed text-fg-dim">
            Activity recorded on the public blockchain is not ours and cannot be deleted by anyone,
            including us.
          </p>
          {!confirming ? (
            <Btn danger onClick={() => setConfirming(true)}>Delete my account</Btn>
          ) : (
            <div>
              {/* The instruction is tied to the field with aria-describedby,
                  and the field has a real accessible name. It had neither: the
                  placeholder was doing the work of a label, which disappears
                  the moment you type and is not a label to a screen reader —
                  on the one irreversible control in the product. */}
              <p id="erase-help" className="mb-2.5 text-sm text-danger">
                Type <b>DELETE</b> to confirm. There is no undo.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  aria-label="Type DELETE to confirm erasing your account"
                  aria-describedby="erase-help"
                  spellCheck={false}
                  // 16px on phones so iOS does not zoom in on focus — see the
                  // note on the onboarding Field. This is the confirmation for
                  // an irreversible delete; being trapped zoomed here is worse.
                  className="w-[200px] border-b border-edge-strong bg-transparent px-1 py-2 font-mono text-base outline-none focus:border-danger sm:text-sm"
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

/* Held to a column. Full-bleed suits the feed and the tape, where the width is
   the point; here it stranded every value a thousand pixels from its own label.
   It now takes that column from the shell every other route uses, rather than
   naming a fourth width of its own — 54rem agreed with nothing else on the
   site, so this was the one page whose left edge was its own. */
function Wrap({ children }: { children: React.ReactNode }) {
  return <Page width="prose">{children}</Page>
}

/* One definition, both states. The disconnected page shows the identical list
   with every row reading "not set", which is the whole point: the disclosure is
   worth more before you connect than after. */
function Fields({ rows }: { rows: [string, React.ReactNode, string?][] }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map(([label, value, hint]) => {
        const empty = value === null || value === undefined || value === ""
        return (
          <div key={label} className="flex items-center gap-3 border-b border-edge py-3">
            <div className="min-w-0 flex-1">
              {/* text-fg, not the stray #c8cdd6 these rows carried over from the
                  pre-Aperture palette. */}
              <div className="text-sm font-semibold text-fg">{label}</div>
              {hint && <div className="mt-0.5 text-xs text-fg-dim">{hint}</div>}
            </div>
            <span className={`flex-none truncate text-xs ${empty ? "text-fg-dim" : "font-mono text-fg"}`}>
              {empty ? "not set" : String(value)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-bold">{title}</h2>
        {note && <span className="text-xs text-fg-dim">{note}</span>}
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
      className={`block-btn border disabled:opacity-50 ${
        danger
          ? "border-danger/40 text-danger hover:border-danger/70 hover:bg-danger/10"
          : "border-edge bg-white/[.03] text-fg-muted hover:border-edge-strong hover:text-fg"
      }`}
    >
      {children}
    </button>
  )
}
