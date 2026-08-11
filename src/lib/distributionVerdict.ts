/* One severity ladder for holder distribution, two renderings.
 *
 * The token page states it as a sentence and the feed row as a short badge, and
 * they must never disagree — a row reading "TOP10 95%" beside a page calling the
 * same token healthy is worse than either alone. This codebase has been bitten
 * repeatedly by the same rule living in two places (the swap panel's headings vs
 * the audit suites' matchers, twice), so the ladder lives here and both surfaces
 * ask it.
 *
 * Ordered by how much it matters, first match wins. The ORDER is the design: a
 * token can be concentrated AND have a departed deployer AND thin holders, and
 * leading with the least consequential buries the one that decides the trade.
 *
 * Everything here is an observation about what the chain says. None of it
 * predicts a price — "the deployer holds 25%" is a fact, "the deployer may dump"
 * is a forecast, and this product does not make forecasts.
 */

export type Severity = "bad" | "warn" | "ok" | "unknown"

export type DistributionFacts = {
  holders: number
  top10Pct: number | null
  devHoldsPct: number | null
  devSold: boolean
  firstBuyers?: number
  firstBuyersStillHolding?: number
}

export type DistributionVerdict = {
  severity: Severity
  /** The full sentence, for a page that has room to explain. */
  sentence: string
  /** The same judgement compressed for a row that is scanned, not read.
      Null when nothing is adverse — a healthy spread needs no badge. */
  badge: string | null
}

export function judgeDistribution(d: DistributionFacts): DistributionVerdict {
  const first = d.firstBuyers ?? 0
  const stillIn = d.firstBuyersStillHolding ?? 0

  if (d.holders === 0) {
    return {
      severity: "unknown",
      sentence: "Nobody holds this yet. Every token is still with the pool or the contract.",
      badge: "NO HOLDERS",
    }
  }
  if (d.holders === 1) {
    return {
      severity: "bad",
      sentence: "One wallet holds every token in circulation.",
      badge: "1 HOLDER",
    }
  }
  if (d.devHoldsPct !== null && d.devHoldsPct >= 20) {
    return {
      severity: "bad",
      /* The "more than everyone else combined" clause is only TRUE above 50%,
         and this branch fires from 20%. Saying it at 25% would be a plain
         arithmetic overclaim on a panel whose whole argument is that its figures
         can be checked. */
      sentence:
        d.devHoldsPct > 50
          ? `The deployer still holds ${d.devHoldsPct}% of the entire supply — more than everyone else combined.`
          : `The deployer still holds ${d.devHoldsPct}% of the entire supply.`,
      badge: `DEV ${Math.round(d.devHoldsPct)}%`,
    }
  }
  if (d.holders <= 5) {
    return {
      severity: "bad",
      sentence: `Only ${d.holders} wallets hold this.`,
      badge: `${d.holders} HOLDERS`,
    }
  }
  if (d.top10Pct !== null && d.top10Pct >= 90) {
    return {
      severity: "bad",
      sentence: `${d.holders} wallets hold it, but the largest ten have ${d.top10Pct}% between them.`,
      badge: `TOP10 ${Math.round(d.top10Pct)}%`,
    }
  }
  if (first >= 3 && stillIn === 0) {
    return {
      severity: "warn",
      sentence: `Every one of the first ${first} buyers has already sold out.`,
      badge: "EARLY BUYERS OUT",
    }
  }
  if (d.devSold) {
    return {
      severity: "warn",
      sentence: `${d.holders} wallets hold it, and the deployer has sold theirs.`,
      badge: "DEV SOLD",
    }
  }
  if (d.top10Pct !== null && d.top10Pct >= 70) {
    return {
      severity: "warn",
      sentence: `${d.holders} wallets hold it, with ${d.top10Pct}% concentrated in the largest ten.`,
      badge: `TOP10 ${Math.round(d.top10Pct)}%`,
    }
  }
  return {
    severity: "ok",
    sentence: `${d.holders} wallets hold it, the largest ten ${d.top10Pct}% between them. That is a real spread for a launch this age.`,
    badge: null,
  }
}
