import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Article, Section, Step, Callout, Bullets, Mono, Terms, FootNote } from "@/components/site/Article"
import { useSeparation } from "@/components/figures"
import { useStats } from "@/lib/useStats"
import { getJSON, ago } from "@/lib/api"
import type { Theme } from "@/lib/api"

/* A percentage read from the live index, never typed into the page.
 *
 * These pages carried "roughly 69% of launches are near-copies" in three places
 * while `/intel/stats` was returning 45.7 — a 51% overstatement, visible one
 * click apart in the same session, on a site whose landing page promises "every
 * figure here is read from the live index when the page loads". A frozen
 * transcription stops being evidence the moment the data moves.
 *
 * Until it resolves, and if the call fails, the sentence has to read correctly
 * without a number at all — hence `fallback`, which is a word rather than a
 * stale figure. */
function LivePct({
  of,
  fallback,
}: {
  of: "duplicatePct" | "highRiskPct"
  fallback: React.ReactNode
}) {
  const stats = useStats()
  if (!stats) return <>{fallback}</>
  return <b>{stats[of]}%</b>
}

/* The two populations the risk score is judged on, measured on request.
 *
 * These were two hardcoded figures — 56.0% against 13.3%, n=232 — from one run
 * of the backtest, and the "4.2x" quoted all over the site is their ratio. A
 * frozen measurement presented in the present tense stops being evidence the
 * moment the data moves, which for a live index is immediately.
 *
 * When the measurement cannot be had, the recorded pair is still shown, but
 * labelled as recorded — losing the argument entirely would be worse, and
 * pretending the number is current would be dishonest. */
const RECORDED = {
  low: { pct: 56.0, n: 134 },
  high: { pct: 13.3, n: 98 },
}

function SurvivalSplit() {
  const sep = useSeparation()
  const low = sep ? { pct: sep.lowRisk!.survivalPct!, n: sep.lowRisk!.n } : RECORDED.low
  const high = sep ? { pct: sep.highRisk!.survivalPct!, n: sep.highRisk!.n } : RECORDED.high
  const lift = sep ? sep.lift! : RECORDED.low.pct / RECORDED.high.pct

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Not both lime. One of these is the good outcome and one is the bad
            one, and rendering them in the same signal colour destroys the
            comparison this section exists to make. */}
        {[
          { ...low, l: "of low-risk launches still active", tone: "text-acid-500" },
          { ...high, l: "of high-risk launches still active", tone: "text-danger" },
        ].map((s) => (
          <div key={s.l} className="border-t border-edge pt-5">
            <div className={`font-display text-3xl font-bold leading-none ${s.tone}`}>
              {s.pct.toFixed(1)}%
            </div>
            <p className="mt-2 text-sm text-fg-muted">{s.l}</p>
            <p className="mt-1 font-mono text-xs text-fg-dim">n={s.n.toLocaleString("en-US")}</p>
          </div>
        ))}
      </div>
      <p>
        A <b>{lift.toFixed(1)}x separation</b>, from information available at block zero.
        {/* "The duplicate flag on its own has held at 2–3x across four
            independent samples" was here. No endpoint returns a per-flag
            separation, so the claim cannot be checked from the product — which
            is the standard this very page is arguing for. */}
      </p>
      <p className="font-mono text-xs text-fg-dim">
        {sep
          ? `Measured now, over ${sep.sampleSize.toLocaleString("en-US")} launches at the ${sep.checkpoint}-minute checkpoint.`
          : "Recorded sample, not a live reading — the index is not currently returning a measurement."}
      </p>
    </>
  )
}

/* All long-form pages. Kept together because they share one layout and one
   voice; splitting them into nine files would be nine places to drift. */

export function HowItWorks() {
  return (
    <Article
      kicker="How it works"
      title="Four steps, none of which need a price"
      standfirst="Existing tools wait for a token to trade before they can say anything about it. By then the first minutes are over. Here is what runs instead, from the moment a token exists."
    >
      <Section>
        <Step
          title="Watch every launch, on every launchpad"
          plain="Discovery is chain-wide rather than tied to one launchpad, so a theme that spans several pads is visible as one narrative."
          runs={
            <>
              Watching a single factory captured about a fifth of the market in testing, and most
              launchpad contracts are unverified so publish nothing decodable. Instead NewEra
              watches the ERC-20 mint event every token emits. Three filters keep it clean: position
              NFTs (which share the <Mono>Transfer</Mono> signature but carry four topics), existing
              tokens that mint — WETH on every deposit — and AMM pair tokens, which expose{" "}
              <Mono>token0()</Mono>.
            </>
          }
        />
        <Step
          title="Cluster by meaning, not by ticker"
          plain='"Trust in Trump", "Trump Trust" and "Trumpp" are one narrative, not three unrelated tokens.'
          runs={
            <>
              Names are normalised — casefolded, stripped of filler words, with lookalike letters
              folded to Latin. Two measures run in parallel: shared meaningful words, and edit
              distance between normalised strings. Whichever scores higher decides, because spammers
              vary both word order and spelling. Matching is limited to themes seen in the last six
              hours, so a dead cluster cannot absorb today&apos;s launches.
            </>
          }
        />
        <Step
          title="Flag copies and impersonation at block zero"
          plain="Most launches copy something minutes old. Some go further and impersonate a specific token using characters you cannot see."
          runs={
            <>
              Invisible characters and cross-alphabet lookalikes are folded and flagged. Folding
              matters more than flagging: an unfolded spoof fails to cluster with the token it
              imitates, which is exactly what the spoofer wants.
            </>
          }
        />
        <Step
          title="Separate a narrative from one wallet talking to itself"
          plain="Thirty launches from one address is not a trend. Creator count sits beside every launch count."
          runs={
            <>
              A cluster is only marked <Mono>EMERGING</Mono> — the state the ranking promotes —
              when enough distinct wallets are behind it. Thirty launches from one address and
              sixteen from nine are the same shape and opposite meanings.
            </>
          }
        />
      </Section>

      <Section title="What this cannot do">
        <p>
          Clustering tells you what is being created and how fast. It does not tell you what a token
          will be worth. We have measured that flagged, duplicate-heavy launches survive far less
          often than clean ones — but survival means <em>somebody traded it</em>, not that it went up.
        </p>
        <Callout tone="warn" label="Read it right">
          Anyone claiming to forecast memecoin prices from launch metadata is selling something.
          What this does is narrow tens of thousands of daily launches down to the handful worth a
          second look.
        </Callout>
      </Section>

      <FootNote />
    </Article>
  )
}

export function Themes() {
  return (
    <Article
      kicker="Theme intelligence"
      title="A hundred tokens, one idea."
      standfirst="Tokens don't launch alone. Something happens in the world, and within minutes dozens of wallets deploy their own version of it. Read individually those launches look like noise. Grouped by meaning, they show you the narrative while it is still forming."
    >
      {/* The nav calls this "Clusters", so it opens with clusters.
          Clicking a menu item labelled with a noun and landing on an essay
          about that noun is the same fault as the feed opening with prose: the
          page answers a question the visitor did not ask yet. The explanation
          below is worth reading — it is just not what "Clusters" promises. */}
      <Section>
        <LiveClusters />
      </Section>

      <Section>
        <Callout label="Observed live — four launches, two seconds apart">
          <div className="flex flex-col gap-1 font-mono text-sm text-fg-muted">
            <span>13:25:39 &nbsp; TRUST⁠ &nbsp; Trust in Trump</span>
            <span>13:25:40 &nbsp; TRUST⁠ &nbsp; Trust in Trump</span>
            <span>13:25:41 &nbsp; TIT &nbsp;&nbsp;&nbsp; Trust In Trump</span>
            <span>13:25:41 &nbsp; TIT &nbsp;&nbsp;&nbsp; Trust in Trump</span>
            <span className="mt-1 text-acid-500">→ one theme, four tokens, four different tickers</span>
          </div>
        </Callout>
      </Section>

      <Section title="The number that matters most">
        <p>
          Launch count alone will mislead you. Thirty tokens from one wallet is one person with a
          script; eight tokens from six independent wallets is a narrative. The two look identical if
          you only count launches, which is why <b>creator count sits beside every launch count</b>{" "}
          throughout the product.
        </p>
        <p>
          A cluster is only marked <Mono>EMERGING</Mono> when enough distinct wallets are behind it.
          One-wallet floods are pushed down and labelled.
        </p>
      </Section>

      <Section title="The four states">
        <Terms
          items={[
            /* "Still an edge" and "the move has mostly happened" are claims
               about what a price will do next. The states describe launch
               behaviour and nothing else, so they are worded as observations
               about launches. */
            { term: "EMERGING", body: "Young, accelerating, not yet crowded. The only state where independent wallets are still arriving." },
            { term: "HOT", body: "High launch velocity and still climbing, but already visible to everyone else looking." },
            { term: "SATURATED", body: "Crowded, and launch velocity is falling away from its peak." },
            { term: "DECAYING", body: "Almost nothing new is launching into it." },
          ]}
        />
      </Section>

      <Section title="Velocity, not a running total">
        <p>
          A theme with 40 launches that stopped an hour ago is finished. One with 6 launches
          accelerating right now is not. Launches per hour are sampled continuously and compared
          against the theme&apos;s own peak, so status reflects the direction of travel rather than
          the size of the pile.
        </p>
      </Section>

      <FootNote />
    </Article>
  )
}

export function Detection() {
  return (
    <Article
      kicker="Impersonation detection"
      title="Two tickers that look identical, and aren't."
      /* The number lived here as "roughly 69%" against a live 45.7%. The
         standfirst takes a plain string, so rather than freeze a new figure that
         will drift the same way, it states the shape and leaves the measurement
         to the live one further down the page. */
      standfirst="Most launches are near-copies of something minutes old. A smaller number go further and impersonate a specific token, using characters your eye cannot see. Both are detectable from the moment of creation, before a single trade happens."
    >
      <Section>
        <Callout label="The same four characters, twice">
          <div className="flex flex-col gap-1 font-mono text-sm text-fg-muted">
            <span>TRUST&nbsp;&nbsp;&nbsp;&nbsp;→ 5 characters</span>
            <span>TRUST⁠&nbsp;&nbsp;&nbsp;→ 6 characters (one is invisible)</span>
            <span className="mt-1 text-acid-500">→ renders identically, different string, different token</span>
          </div>
        </Callout>
      </Section>

      <Section title="What gets flagged">
        <Bullets
          items={[
            <><b>Invisible characters</b> — a zero-width or word-joining character padded into a ticker. There is no legitimate reason for one to appear, so this is weighted heaviest.</>,
            <><b>Cross-alphabet lookalikes</b> — a Cyrillic <Mono>А</Mono> or Greek <Mono>Α</Mono> standing in for a Latin <Mono>A</Mono>. Visually identical, technically unrelated.</>,
            <><b>Name collision</b> — a near-identical name launched inside the same short window. The most common pattern by far, and the most predictive.</>,
            <><b>Creator behaviour</b> — total launches, densest 60-second burst, and whether they ever stake anything of their own.</>,
          ]}
        />
      </Section>

      <Section title="Does any of it predict anything?">
        <p>
          Every launch is measured again thirty minutes later to see whether anyone traded it.
          Comparing launches the score rated low-risk against those it rated high-risk:
        </p>
        <SurvivalSplit />
      </Section>

      <Section title="What this does not mean">
        <Callout tone="warn">
          &ldquo;Still active&rdquo; means somebody traded the token. It does not mean it made money,
          and the score is not a price forecast. A high risk score says <em>this looks
          machine-generated</em> — a narrower and more defensible claim. A clean, low-risk launch can
          still go to zero, and most tokens do.
        </Callout>
      </Section>

      <Section title="Reading the score">
        <Terms
          items={[
            /* "The default filter on the live feed" was not true: the feed has
               no default risk filter — "Hide likely spam" starts off, and when
               switched on it filters at 25, not 14. And "roughly a third" was a
               frozen transcription of what /intel/stats reports live. */
            { term: "0 – 14 · low", body: "No spoof flags, no burst, often a real creator stake." },
            { term: "15 – 39 · medium", body: "Usually a name collision — a copy of something recent, without deliberate impersonation." },
            { term: "40 – 100 · high", body: "Impersonation characters, dense bursts, or a serial creator with nothing staked. This is the band the live feed hides when you switch on “Hide likely spam”." },
          ]}
        />
      </Section>

      <FootNote />
    </Article>
  )
}

export function About() {
  return (
    <Article
      kicker="About NewEra"
      title="Most of what launches is noise. We say which."
      standfirst="NewEra is launch intelligence for Robinhood Chain. Tens of thousands of tokens are created there every day, and for the first minutes of a token's life there is no price, no chart and no holders — so every analytics tool is blind. We index the only thing that exists yet: what the token means, who made it, and whether it is a copy."
    >
      <Section title="The problem">
        <p>
          Trading terminals index transactions, so a token has to trade before they can tell you
          anything about it. Attention platforms index social reach, so it needs an audience it does
          not have yet. Both are useful later and useless during the window that decides a
          memecoin&apos;s life.
        </p>
        <p>
          Meanwhile the raw feed is unreadable. Right now{" "}
          <LivePct of="duplicatePct" fallback={<>most</>} /> of launches carry a duplicate or
          impersonation flag. Reading that unfiltered is not research, it is scrolling.
        </p>
        {/* "Around 70% are effectively dead within half an hour" was here, and
            no endpoint returns an overall abandonment rate — `/intel/separation`
            measures survival for the low- and high-risk cohorts only, so the
            middle band is not in it and a population figure cannot be derived.
            An unbacked number on the page that argues for measurement is the
            one thing that cannot stay. */}
      </Section>

      <Section title="What we do">
        <p>
          At block zero a token has a name, a ticker, a deployer and whatever that deployer staked.
          That is enough. Names normalise and cluster into narratives, so you see a theme forming
          while it is still forming. Copies and ticker impersonation get flagged. Creator history
          separates a founder from a factory.
        </p>
        <Terms
          items={[
            { term: "Chain-wide, not launchpad-wide", body: "Watching a single launchpad's contract captures around a fifth of the market. We watch the whole chain, so themes spanning multiple pads read as one narrative." },
            { term: "Creators, not just counts", body: "Thirty launches from one wallet is a script. Eight from six wallets is a narrative. Creator count sits beside every launch count so the two never get confused." },
            { term: "Tested, not asserted", body: "The risk score is measured against what actually happened to each token: low-risk launches stay active several times more often than high-risk ones. The current multiple and its sample size are on the detection page, read live rather than quoted." },
            { term: "Open by default", body: "The feed, theme pages and API are free, public and unauthenticated. There are no tiers." },
          ]}
        />
      </Section>

      <Section title="What we won't claim">
        <p>
          We do not predict price, and we will not pretend to. What has been measured is{" "}
          <em>survival</em> — whether anyone traded a token at all after it launched. On that measure
          the signal is strong and it replicates. On price, we have no evidence, so we make no claim.
        </p>
        <p>
          A clean, low-risk launch can still go to zero, and most tokens do. What the product
          reliably removes is the manufactured noise that was never going anywhere. On this chain
          that is the majority of what launches, which is enough to be worth having.
        </p>
      </Section>

      <FootNote />
    </Article>
  )
}

/* The standfirst used to end "for data requests, use the address below." There
   was no address below, nor anywhere else on the site — zero mailto links and
   zero addresses in rendered text — while the privacy policy promised email
   requests answered within a month. A commitment with no channel behind it is
   worse than no commitment. Every route named here now exists and works. */
export function Contact() {
  return (
    <Article
      kicker="Contact"
      title="Get in touch"
      standfirst="The fastest route is X. Anything held against your wallet you can export or erase yourself, without asking."
    >
      <Section>
        <Terms
          items={[
            { term: "X / Twitter", body: "Product updates and the fastest reply." },
            {
              term: "Your data",
              body: "Everything stored against a wallet can be downloaded or permanently deleted from the account page, by you, without contacting anyone.",
            },
            {
              term: "Something wrong?",
              body: "If a token or cluster is labelled in a way you believe is incorrect, say so on X with the address and we will look at it. The scores are computed, not curated, so a wrong label is a bug worth fixing.",
            },
          ]}
        />
        <p>
          {/* Alone in its own paragraph, so the inline-link exemption in WCAG
              2.2 does not apply — nothing constrains its height but itself. */}
          <a
            href="https://x.com/New_EraAI"
            target="_blank"
            rel="noopener noreferrer"
            className="scan-link -my-1.5 inline-block py-1.5 text-acid-500"
          >
            @New_EraAI ↗
          </a>
        </p>
        <Callout label="Self-serve">
          Everything we hold against a wallet is visible on your account page, along with buttons to
          download or erase it. You do not need to ask us.
        </Callout>
      </Section>
      <FootNote />
    </Article>
  )
}


/* The clusters forming right now, at the top of the page named after them.
 *
 * Deliberately a short list rather than the whole set: this is a Read surface
 * and the full, filterable list lives on the feed. It exists so that clicking
 * "Clusters" answers with clusters, and so a reader who is convinced by the
 * explanation below has somewhere to go that is not the back button. */
function LiveClusters() {
  const [themes, setThemes] = useState<Theme[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    getJSON<{ items: Theme[] }>("/intel/themes?limit=6&organicOnly=1")
      .then((r) => alive && setThemes(r.items))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  if (failed) {
    return (
      <p className="text-sm text-warn">
        The index is not answering, so there is nothing live to show here right now.
      </p>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-edge pb-3">
        <h2 className="text-xl font-semibold text-fg">Forming right now</h2>
        <Link to="/app" className="scan-link -my-1.5 py-1.5 font-mono text-micro uppercase tracking-[0.12em] text-acid-500">
          All of them, live →
        </Link>
      </div>

      {themes === null ? (
        <div className="mt-4 flex flex-col gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]" />
          ))}
        </div>
      ) : themes.length === 0 ? (
        <p className="mt-4 text-sm text-fg-muted">
          No cluster right now has independent wallets launching into it. That is a real state of the
          chain, not an error — it is what a quiet hour looks like.
        </p>
      ) : (
        <div className="mt-1 grid sm:grid-cols-2 sm:gap-x-10">
          {themes.map((t) => (
            <Link
              key={t.id}
              to={`/app/theme/${t.slug}`}
              className="scan-row border-b border-edge py-3.5 pl-3"
            >
              <span className="block truncate text-base font-semibold text-fg">{t.label}</span>
              <span className="mt-1 block text-sm text-fg-muted">
                <b className="font-semibold text-acid-500">{t.creatorCount} wallets</b>,{" "}
                {t.launchCount} launches, {ago(t.ageMinutes * 60)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
