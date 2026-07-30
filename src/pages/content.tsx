import { Article, Section, Step, Callout, Bullets, Mono, Terms, FootNote } from "@/components/site/Article"

/* All long-form pages. Kept together because they share one layout and one
   voice; splitting them into nine files would be nine places to drift. */

export function HowItWorks() {
  return (
    <Article
      kicker="How it works"
      title="Four steps, none of which need a price"
      standfirst="Existing tools wait for a token to trade before they can say anything about it. By then the move has happened. Here is what runs instead, from the moment a token exists."
    >
      <Section>
        <Step
          n="01"
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
          n="02"
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
          n="03"
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
          n="04"
          title="Separate a narrative from one wallet talking to itself"
          plain="Thirty launches from one address is not a trend. Creator count sits beside every launch count."
          runs={
            <>
              A theme is only marked <Mono>EMERGING</Mono> — the state worth acting on — when enough
              distinct wallets are behind it. Observed live: a 30-launch theme from a single creator
              against a 16-launch theme from nine. Same shape, opposite meaning.
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
      <Section>
        <Callout label="Observed live — four launches, two seconds apart">
          <div className="flex flex-col gap-1 font-mono text-sm text-fg-muted">
            <span>13:25:39 &nbsp; TRUST⁠ &nbsp; Trust in Trump</span>
            <span>13:25:40 &nbsp; TRUST⁠ &nbsp; Trust in Trump</span>
            <span>13:25:41 &nbsp; TIT &nbsp;&nbsp;&nbsp; Trust In Trump</span>
            <span>13:25:41 &nbsp; TIT &nbsp;&nbsp;&nbsp; Trust in Trump</span>
            <span className="mt-1 opacity-60">→ one theme, four tokens, four different tickers</span>
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
          A theme is only marked <Mono>EMERGING</Mono> when enough distinct wallets are behind it.
          One-wallet floods are pushed down and labelled, not promoted as opportunities.
        </p>
      </Section>

      <Section title="The four states">
        <Terms
          items={[
            { term: "EMERGING", body: "Young, accelerating, not yet crowded, driven by independent creators. The only state where there is still an edge." },
            { term: "HOT", body: "High velocity and still climbing, but already visible to everyone else looking." },
            { term: "SATURATED", body: "Crowded, and velocity is falling away from its peak. The move, if there was one, has mostly happened." },
            { term: "DECAYING", body: "Effectively over. Almost nothing new is launching into it." },
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
      standfirst="Roughly 69% of launches are near-copies of something minutes old. A smaller number go further and impersonate a specific token, using characters your eye cannot see. Both are detectable from the moment of creation, before a single trade happens."
    >
      <Section>
        <Callout label="The same four characters, twice">
          <div className="flex flex-col gap-1 font-mono text-sm text-fg-muted">
            <span>TRUST&nbsp;&nbsp;&nbsp;&nbsp;→ 5 characters</span>
            <span>TRUST⁠&nbsp;&nbsp;&nbsp;→ 6 characters (one is invisible)</span>
            <span className="mt-1 opacity-60">→ renders identically, different string, different token</span>
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
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { v: "56.0%", l: "of low-risk launches still active", n: "n=134" },
            { v: "13.3%", l: "of high-risk launches still active", n: "n=98" },
          ].map((s) => (
            <div key={s.l} className="rounded-2xl border border-edge bg-ink-850 p-5">
              <div className="font-display text-3xl font-bold leading-none text-acid-500">{s.v}</div>
              <p className="mt-2 text-sm text-fg-muted">{s.l}</p>
              <p className="mt-1 font-mono text-xs text-fg-dim">{s.n}</p>
            </div>
          ))}
        </div>
        <p>
          A <b>4.2x separation</b>, from information available at block zero. The duplicate flag on
          its own has held at 2–3x across four independent samples.
        </p>
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
            { term: "0 – 14 · low", body: "No spoof flags, no burst, often a real creator stake. The default filter on the live feed." },
            { term: "15 – 39 · medium", body: "Usually a name collision — a copy of something recent, without deliberate impersonation." },
            { term: "40 – 100 · high", body: "Impersonation characters, dense bursts, or a serial creator with nothing staked. Roughly a third of all launches." },
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
          Meanwhile the raw feed is unreadable. We measured it: roughly <b>69% of launches are
          near-copies</b> of something deployed minutes earlier, and around <b>70% are effectively
          dead within half an hour</b>. Reading that unfiltered is not research, it is scrolling.
        </p>
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
            { term: "Tested, not asserted", body: "The risk score is measured against what actually happened to each token. Low-risk launches stayed active 4.2x more often than high-risk ones." },
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

export function Contact() {
  return (
    <Article kicker="Contact" title="Get in touch" standfirst="The fastest route is X. For data requests, use the address below.">
      <Section>
        <Terms
          items={[
            { term: "X / Twitter", body: "@New_EraAI — product updates and the fastest reply." },
            { term: "Data requests", body: "To export or delete the record held against your wallet, use your account page, or write to us and we will respond within one month." },
          ]}
        />
        <Callout label="Self-serve">
          Everything we hold against a wallet is visible on your account page, along with buttons to
          download or erase it. You do not need to ask us.
        </Callout>
      </Section>
      <FootNote />
    </Article>
  )
}
