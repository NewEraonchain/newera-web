import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { getJSON, shortAddr } from "@/lib/api"
import type { CreatorDossier } from "@/lib/api"
import { EXPLORER, EmptyState, Skeleton } from "@/components/intel"
import { LaunchTable } from "@/components/LaunchTable"
import { Page } from "@/components/shell"
import { useMarkets } from "@/lib/markets"

/* Who deployed this.
 *
 * `GET /intel/creators/:wallet` has returned a full behavioural record since
 * the index was built, and no screen rendered a single field of it. The tape
 * provokes the question on every row — one wallet in a forty-launch sample had
 * deployed 1,782 tokens across 1,413 clusters in four days with a 58% duplicate
 * rate — and the only place that asked it, the cluster page's creator list,
 * linked out to a block explorer, which can show you transactions and cannot
 * tell you any of that.
 *
 * The record is behaviour only: counts, rates, bursts, stake. No identity, no
 * allowlist, no human curation. The page says what the wallet has DONE and
 * stops there — a spam score is a statement about how mechanical the output
 * looks, not about the person, and certainly not about whether anything they
 * launched is worth buying. */

export default function Creator() {
  const { wallet = "" } = useParams()
  const [data, setData] = useState<CreatorDossier | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    setError(null)
    getJSON<CreatorDossier>(`/intel/creators/${encodeURIComponent(wallet)}`)
      .then(setData)
      .catch((e: Error) =>
        setError(
          e.message.includes("404")
            ? "No launches recorded for this address."
            : e.message.includes("400")
              ? "That does not look like a wallet address."
              : "Could not load this deployer. The intelligence API is not responding — try again in a moment.",
        ),
      )
  }, [wallet])

  useEffect(() => {
    if (data?.wallet) document.title = `${shortAddr(data.wallet)} · Deployer · NewEra`
  }, [data])

  if (error) return <Shell wallet={wallet}><EmptyState>{error}</EmptyState></Shell>
  if (!data) {
    return (
      <Shell wallet={wallet}>
        <Skeleton h={120} />
      </Shell>
    )
  }

  return (
    <Shell wallet={data.wallet}>
      <Read dossier={data} />
      <Facts dossier={data} />
      <Launches dossier={data} />
    </Shell>
  )
}

function Shell({ wallet, children }: { wallet: string; children: React.ReactNode }) {
  return (
    <Page>
      <Link
        to="/app"
        className="mb-4 inline-flex items-center gap-2 py-1.5 text-sm text-fg-dim transition-colors hover:text-acid-500"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back to live feed
      </Link>

      <h1 className="font-mono text-[clamp(1.1rem,2.4vw,1.6rem)] font-semibold tracking-[-0.01em] text-fg">
        {shortAddr(wallet)}
      </h1>
      <p className="mt-1 break-all font-mono text-xs text-fg-dim">{wallet}</p>
      <p className="mt-3">
        <a
          href={`${EXPLORER}/address/${wallet}`}
          target="_blank"
          rel="noopener noreferrer"
          className="scan-link -my-1.5 py-1.5 text-xs text-acid-500"
        >
          View transactions on Blockscout ↗
        </a>
      </p>

      <div className="mt-[6vh]">{children}</div>
    </Page>
  )
}

/* The record in a sentence, before any table of it. */
function Read({ dossier }: { dossier: CreatorDossier }) {
  const p = dossier.profile
  if (!p) {
    return (
      <p className="measure text-base leading-relaxed text-fg-muted">
        No behavioural record has been built for this address yet. That usually means it has
        launched only once, or its first launch is very recent.
      </p>
    )
  }

  const days = Math.max(
    1,
    Math.round((Date.parse(p.lastLaunchAt) - Date.parse(p.firstLaunchAt)) / 86_400_000),
  )
  const heavy = p.totalLaunches >= 50
  const dupey = p.duplicateRate >= 40

  return (
    <div className="border-y border-edge py-7">
      <p className="max-w-[52ch] text-[clamp(1.05rem,1.7vw,1.35rem)] leading-[1.55] text-fg">
        This address has deployed{" "}
        <b className={`font-mono font-medium ${heavy ? "text-danger" : "text-fg"}`}>
          {p.totalLaunches.toLocaleString("en-US")}
        </b>{" "}
        {p.totalLaunches === 1 ? "token" : "tokens"} across{" "}
        <b className="font-mono font-medium">{p.distinctThemes.toLocaleString("en-US")}</b>{" "}
        {p.distinctThemes === 1 ? "cluster" : "clusters"}
        {days > 1 ? ` over ${days} days` : " today"}.{" "}
        <b className={`font-mono font-medium ${dupey ? "text-warn" : "text-fg"}`}>
          {p.duplicateRate}%
        </b>{" "}
        of them duplicated something already launched.
      </p>
      <p className="measure mt-4 text-sm leading-relaxed text-fg-dim">
        This describes what the address has done. It is not a judgement of the person behind it, and
        it says nothing about whether any token they launched is worth buying.
      </p>
    </div>
  )
}

function Facts({ dossier }: { dossier: CreatorDossier }) {
  const p = dossier.profile
  if (!p) return null

  const items: { v: string; l: string; hint: string; tone?: "bad" | "warn" | "acid" }[] = [
    {
      v: p.totalLaunches.toLocaleString("en-US"),
      l: "tokens deployed",
      hint: "everything this address has launched",
      tone: p.totalLaunches >= 50 ? "bad" : undefined,
    },
    {
      v: p.distinctThemes.toLocaleString("en-US"),
      l: "clusters entered",
      hint: "how many separate narratives they launched into",
    },
    {
      v: `${p.duplicateRate}%`,
      l: "duplicate rate",
      hint: "share that copied something already launched",
      tone: p.duplicateRate >= 40 ? "warn" : undefined,
    },
    {
      v: `${p.fastestBurst}`,
      l: "densest burst",
      hint: "most launches inside a single minute",
      tone: p.fastestBurst >= 5 ? "warn" : undefined,
    },
    {
      v: `${p.totalDevBuyEth.toFixed(3)}Ξ`,
      l: "total stake",
      hint: "ETH they put into their own launches",
      tone: p.totalDevBuyEth > 0 ? "acid" : undefined,
    },
    {
      v: `${p.spamScore}`,
      l: "spam score",
      hint: "0–100, how mechanical the output looks",
      tone: p.spamScore >= 40 ? "bad" : undefined,
    },
  ]

  return (
    <div className="mt-[6vh] grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((m) => (
        <div key={m.l} className="border-t border-edge pt-4">
          <div
            className={`font-display text-2xl font-bold leading-none ${
              m.tone === "bad"
                ? "text-danger"
                : m.tone === "warn"
                  ? "text-warn"
                  : m.tone === "acid"
                    ? "text-acid-500"
                    : "text-fg"
            }`}
          >
            {m.v}
          </div>
          <div className="mt-1.5 text-xs text-fg-muted">{m.l}</div>
          <div className="mt-1 text-xs leading-snug text-fg-dim">{m.hint}</div>
        </div>
      ))}
    </div>
  )
}

function Launches({ dossier }: { dossier: CreatorDossier }) {
  const launches = dossier.launches || []
  const markets = useMarkets(useMemo(() => launches.map((l) => l.address), [launches]))
  const status = markets === null ? "loading" : markets.ok ? "ok" : "down"

  return (
    <section className="mt-[8vh]">
      <div className="flex items-baseline justify-between gap-4 border-b border-edge pb-3">
        <h2 className="text-xl font-semibold text-fg">Recent launches</h2>
        <span className="font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
          {launches.length} shown
        </span>
      </div>

      <div className="mt-6 grid grid-cols-[3rem_minmax(0,1fr)_auto] gap-4 border-b border-edge-strong pb-2 font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">
        <span>Age</span>
        <span>Token</span>
        <span className="text-right">Spam risk</span>
      </div>

      <div>
        {launches.length === 0 ? (
          <EmptyState>No launches recorded for this address.</EmptyState>
        ) : (
          <LaunchTable
            rows={launches.map((l) => ({
              launch: l,
              market: markets?.markets.get(l.address.toLowerCase()),
            }))}
            marketStatus={status}
            caption="Every launch recorded from this deployer"
          />
        )}
      </div>
    </section>
  )
}
