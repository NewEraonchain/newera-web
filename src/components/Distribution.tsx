import { useEffect, useState } from "react"
import { getJSON, type Distribution } from "@/lib/api"
import { SectionHead } from "@/components/shell"

/* Who holds it — and, first, what that adds up to.
 *
 * Six figures is six things to interpret, which is the problem this panel was
 * built to fix rather than restate. The reader's question is "can I get out of
 * this", and the answer is a sentence: the numbers underneath it are the
 * evidence for the sentence, not a substitute for one. The cluster rows on the
 * feed already work this way — "one wallet launched all 11 of these" — and this
 * is the same move applied to holders.
 *
 * Every line is an observation about what the chain says right now. None of it
 * predicts a price, and the wording is chosen so that it cannot be read as
 * advice to buy or sell: "the deployer holds 25%" is a fact, "the deployer may
 * dump" is a forecast, and this product does not make forecasts. */

type Verdict = { text: string; tone: "bad" | "warn" | "ok" | "unknown" }

/* Ordered by how much it matters, and the first one that fits wins.
 *
 * The order is the whole design. A token can be concentrated AND have a
 * departed deployer AND thin holders; leading with the least consequential of
 * those buries the one that decides the trade. */
export function readDistribution(d: Distribution): Verdict {
  if (d.holders === 0) {
    return {
      tone: "unknown",
      text: "Nobody holds this yet. Every token is still with the pool or the contract.",
    }
  }
  if (d.holders === 1) {
    return {
      tone: "bad",
      text: "One wallet holds every token in circulation.",
    }
  }
  if (d.devHoldsPct !== null && d.devHoldsPct >= 20) {
    return {
      tone: "bad",
      /* The "more than everyone else combined" clause is only TRUE above 50%,
         and this branch fires from 20%. Saying it at 25% would be a plain
         arithmetic overclaim on a panel whose whole argument is that its
         figures can be checked. Above half, the comparison is worth making
         because it is the fact that matters; below it, the number speaks. */
      text:
        d.devHoldsPct > 50
          ? `The deployer still holds ${d.devHoldsPct}% of the entire supply — more than everyone else combined.`
          : `The deployer still holds ${d.devHoldsPct}% of the entire supply.`,
    }
  }
  if (d.holders <= 5) {
    return {
      tone: "bad",
      text: `Only ${d.holders} wallets hold this.`,
    }
  }
  if (d.top10Pct !== null && d.top10Pct >= 90) {
    return {
      tone: "bad",
      text: `${d.holders} wallets hold it, but the largest ten have ${d.top10Pct}% between them.`,
    }
  }
  if (d.firstBuyers >= 3 && d.firstBuyersStillHolding === 0) {
    return {
      tone: "warn",
      text: `Every one of the first ${d.firstBuyers} buyers has already sold out.`,
    }
  }
  if (d.devSold) {
    return {
      tone: "warn",
      text: `${d.holders} wallets hold it, and the deployer has sold theirs.`,
    }
  }
  if (d.top10Pct !== null && d.top10Pct >= 70) {
    return {
      tone: "warn",
      text: `${d.holders} wallets hold it, with ${d.top10Pct}% concentrated in the largest ten.`,
    }
  }
  return {
    tone: "ok",
    text: `${d.holders} wallets hold it, the largest ten ${d.top10Pct}% between them. That is a real spread for a launch this age.`,
  }
}

const TONE: Record<Verdict["tone"], string> = {
  bad: "text-danger",
  warn: "text-warn",
  ok: "text-acid-500",
  unknown: "text-fg-muted",
}

function Figure({
  v,
  label,
  hint,
  alarm,
}: {
  v: string
  label: string
  hint: string
  alarm?: boolean
}) {
  return (
    <div className="border-t border-edge pt-3">
      <div className={`font-mono text-lg font-semibold ${alarm ? "text-danger" : "text-fg"}`}>
        {v}
      </div>
      <div className="mt-0.5 text-sm text-fg-muted">{label}</div>
      {/* Rendered, not hidden in a title. A hover reaches neither touch nor a
          screen reader, and these labels are exactly the ones a newcomer needs
          explained. */}
      <div className="mt-1 text-xs leading-relaxed text-fg-dim">{hint}</div>
    </div>
  )
}

export default function DistributionPanel({ address }: { address: string }) {
  const [d, setD] = useState<Distribution | null>(null)
  const [state, setState] = useState<"loading" | "ok" | "missing" | "down">("loading")

  useEffect(() => {
    let alive = true
    setD(null)
    setState("loading")
    getJSON<Distribution>(`/intel/token/${encodeURIComponent(address)}/distribution`)
      .then((r) => {
        if (!alive) return
        setD(r)
        setState("ok")
      })
      .catch((e: Error) => {
        if (!alive) return
        setState(e.message.includes("404") ? "missing" : "down")
      })
    return () => {
      alive = false
    }
  }, [address])

  if (state === "missing") return null

  return (
    <section className="mt-[6vh]">
      <SectionHead
        title="Who holds it"
        noteLive
        note={
          state === "loading"
            ? "replaying every transfer…"
            : state === "down"
              ? "unavailable"
              : d
                ? `${d.transfersScanned.toLocaleString("en-US")} transfers since launch`
                : ""
        }
      />

      {state === "loading" && (
        /* The read is a second or two of log replay, so this says what it is
           waiting for rather than pulsing at the reader. */
        <p className="mt-4 text-sm text-fg-dim">
          Reading every transfer this token has made, from its launch block. This takes a
          moment and is exact rather than sampled.
        </p>
      )}

      {state === "down" && (
        <p className="measure mt-4 text-sm leading-relaxed text-warn">
          The chain did not answer this read. That is a failure on our side, not a statement
          about the token — nothing here should be taken as "it has no holders".
        </p>
      )}

      {state === "ok" && d && (
        <>
          {(() => {
            const v = readDistribution(d)
            return (
              <p className={`measure mt-4 text-lg leading-relaxed ${TONE[v.tone]}`}>{v.text}</p>
            )
          })()}

          <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <Figure
              v={d.holders.toLocaleString("en-US")}
              label="wallets holding"
              hint="Excludes the pool and the token's own contract — neither can sell to you."
              alarm={d.holders > 0 && d.holders <= 5}
            />
            <Figure
              v={d.top10Pct === null ? "—" : `${d.top10Pct}%`}
              label="held by the largest ten"
              hint="Above 90% means a handful of wallets can move the price on their own."
              alarm={d.top10Pct !== null && d.top10Pct >= 90}
            />
            <Figure
              v={d.devHoldsPct === null ? "—" : `${d.devHoldsPct}%`}
              label="still held by the deployer"
              hint={
                d.devSold
                  ? "They have already sold some of what they started with."
                  : "Of total supply, including tokens not yet in circulation."
              }
              alarm={d.devHoldsPct !== null && d.devHoldsPct >= 20}
            />
            <Figure
              v={d.firstBuyers === 0 ? "—" : `${d.firstBuyersStillHolding}/${d.firstBuyers}`}
              label="of the first buyers still in"
              hint="The earliest wallets to buy. All of them gone is the clearest exit signal there is."
              alarm={d.firstBuyers >= 3 && d.firstBuyersStillHolding === 0}
            />
          </div>

          <p className="mt-5 text-xs leading-relaxed text-fg-dim">
            Counted from every Transfer this token has emitted since block{" "}
            {d.fromBlock.toLocaleString("en-US")}, read from the chain rather than an index —
            so it is exact, and it is what the chain said a moment ago, not a forecast.
          </p>
        </>
      )}
    </section>
  )
}
