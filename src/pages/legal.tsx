import { Link } from "react-router-dom"
import { Article, Section, Callout, Bullets, Mono, FootNote } from "@/components/site/Article"

/* Terms, Privacy and Risk. These describe an information service that holds no
   funds and executes no trades — the shape of the product, not the previous one. */

const UPDATED = "Last updated: July 2026"

function Meta() {
  return <p className="font-mono text-xs text-fg-dim">{UPDATED}</p>
}

export function Docs() {
  return (
    <Article
      kicker="Docs"
      title="How to use NewEra"
      standfirst="NewEra indexes every token created on Robinhood Chain and tells you what it means before it has a price. Everything below is free and public — the API included."
    >
      <Section title="Getting started">
        <p>There is nothing to set up. Open the live feed and it is already running.</p>
        <Bullets
          items={[
            <>Open the <Link to="/app" className="text-acid-500 hover:underline">live feed</Link>. No wallet, no signup.</>,
            <>Leave <b>Organic themes only</b> on — it hides clusters that are one wallet repeating itself.</>,
            <>Watch the left panel for themes forming and the right panel for the raw tape.</>,
            <>Connect a wallet only if you want preferences saved to your address.</>,
          ]}
        />
      </Section>

      <Section title="Reading the feed">
        <p>Each row on the live tape is one token, newest first.</p>
        <Bullets
          items={[
            <><b>Age</b> — how long ago it launched. Most of what matters happens in the first few minutes.</>,
            <><b>Ticker and name</b> — exactly as deployed, including any characters you cannot see.</>,
            <><b>Stake</b> — ETH the creator committed at launch, when there is any. Real stake is uncommon.</>,
            <><b>Flags</b> — <Mono>COPY</Mono>, <Mono>INVISIBLE</Mono>, <Mono>LOOKALIKE</Mono>. Hover for what each means.</>,
            <><b>Risk</b> — 0 to 100. Green under 15, amber to 40, red above.</>,
          ]}
        />
      </Section>

      <Section title="API reference">
        <p>
          The same endpoints this site runs on. Public, unauthenticated, JSON. Base URL is the
          NewEra API host.
        </p>
        <Bullets
          items={[
            <><Mono>GET /intel/feed</Mono> — the live tape. Query: <Mono>limit</Mono>, <Mono>maxRisk</Mono>, <Mono>organicOnly=1</Mono>, <Mono>themeId</Mono>, <Mono>since</Mono>.</>,
            <><Mono>GET /intel/themes</Mono> — themes forming now, EMERGING first. Query: <Mono>limit</Mono>, <Mono>status</Mono>, <Mono>organicOnly=1</Mono>.</>,
            <><Mono>GET /intel/themes/:slug</Mono> — one theme in full, with its launch list and a velocity series.</>,
            <><Mono>GET /intel/creators/:wallet</Mono> — a deployer&apos;s history: launches, distinct themes, densest burst, duplicate rate, spam score, total staked.</>,
            <><Mono>GET /intel/stats</Mono> — headline counters, plus the block indexing has reached.</>,
          ]}
        />
        <Callout label="Rate limits">
          None enforced today. If you are pulling continuously, cache the feed rather than polling
          faster than the chain produces launches.
        </Callout>
      </Section>

      <Section title="Limits &amp; caveats">
        <Bullets
          items={[
            <><b>&ldquo;Active&rdquo; is not &ldquo;profitable&rdquo;.</b> Survival means someone traded the token. We do not measure price, and nothing here is a return.</>,
            <><b>Unverified launchpads show as an address.</b> Where a factory publishes no readable contract, it is labelled by its address rather than guessed at.</>,
            <><b>Themes are short-lived by design.</b> Clustering only matches against the last six hours.</>,
            <><b>Indexing has a lag.</b> The feed header shows how recently the indexer ran, and says so plainly when it falls behind.</>,
          ]}
        />
        <Callout tone="warn" label="Not advice">
          Nothing on NewEra is investment advice. Most tokens on any chain go to zero, including
          ones this product rates low-risk.
        </Callout>
      </Section>

      <FootNote />
    </Article>
  )
}

export function Terms() {
  return (
    <Article kicker="Legal" title="Terms of Use">
      <Section><Meta /></Section>

      <Section>
        <Callout>
          NewEra is an information service. It reads publicly available blockchain data about tokens
          launched on Robinhood Chain and presents analysis of it. It does not custody funds,
          execute trades, or provide financial advice, and it is free to use.
        </Callout>
      </Section>

      <Section title="1. Accepting these terms">
        <p>
          By using any part of NewEra you agree to these Terms of Use. If you don&apos;t agree with
          them, please don&apos;t use NewEra. They apply to the website, the live feed, and the
          public API.
        </p>
      </Section>

      <Section title="2. Who can use NewEra">
        <Bullets
          items={[
            "You must be old enough to enter a contract in your country (typically 18+).",
            "You must not be barred from using blockchain services under any applicable law or sanctions list.",
            "You are responsible for making sure that using a blockchain analytics service is legal where you live.",
          ]}
        />
      </Section>

      <Section title="3. Your wallet">
        <p>NewEra has no passwords. If you choose to connect, your wallet is your identifier.</p>
        <Bullets
          items={[
            <><b>You control your wallet, not us.</b> We never hold your private keys, seed phrase, or funds.</>,
            <><b>Connecting is optional.</b> The feed works without it. Signing a message proves the address is yours — it authorises no transaction and can move no funds.</>,
            <><b>You are responsible for your wallet&apos;s security.</b> If you lose access to it, we cannot recover it.</>,
          ]}
        />
      </Section>

      <Section title="4. What NewEra provides">
        <Bullets
          items={[
            <><b>It is free.</b> There is no charge, no subscription and no tier.</>,
            <><b>It is informational.</b> NewEra does not hold funds, execute trades, route orders, or act as a broker, exchange or custodian.</>,
            <><b>It is not a token service.</b> Using NewEra requires no token and confers no entitlement to one.</>,
          ]}
        />
      </Section>

      <Section title="5. Not financial advice">
        <Callout tone="danger">
          Nothing published on NewEra is investment, financial, legal or tax advice, and nothing on
          it is a recommendation to buy, sell or hold any asset.
        </Callout>
        <p>
          Scores, theme statuses and labels such as &ldquo;emerging&rdquo; or &ldquo;low risk&rdquo;
          describe patterns in launch data. They are not predictions of price. Our published
          measurements relate to whether a token was traded at all shortly after launch — a measure
          of activity, not of profit. Most tokens on any chain lose all their value, including
          tokens NewEra scores as low risk.
        </p>
        <p>Any decision you make after reading NewEra is yours alone. Do your own research.</p>
      </Section>

      <Section title="6. Accuracy &amp; availability">
        <p>NewEra is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;.</p>
        <Bullets
          items={[
            <><b>Indexing can lag or fail.</b> Blockchain nodes time out and data can be delayed or missing.</>,
            <><b>Analysis can be wrong.</b> Clustering, duplicate detection and scoring are automated heuristics that produce false positives and false negatives.</>,
            <><b>A clean score is not a safety guarantee.</b> Nothing here is verification, endorsement or due diligence of a token, its creator or its contract.</>,
            <><b>Absence is not a signal.</b> A token missing from NewEra implies nothing about it.</>,
          ]}
        />
        <p>
          We may change, suspend or discontinue any part of the service, including the methodology
          behind any score, at any time and without notice.
        </p>
      </Section>

      <Section title="7. Acceptable use">
        <Bullets
          items={[
            "Do not attempt to exploit, attack, overload or disrupt the site, the API or the infrastructure behind them.",
            "Do not automate requests at a volume that degrades the service for others.",
            "Do not present NewEra data as your own original research, or republish it in a way implying we endorse a token or a decision.",
            "Do not use the service to promote a token you have an undisclosed interest in, or to manipulate any market.",
            "Do not use the service to launder funds or evade sanctions.",
          ]}
        />
      </Section>

      <Section title="8. Data &amp; intellectual property">
        <p>
          The underlying blockchain records NewEra reads are public and belong to no one. The
          analysis layered on top — the clustering, scoring, theme labels and their presentation —
          is ours.
        </p>
        <p>
          You may use NewEra data, including via the public API, for your own research and products,
          provided you do not present it as unanalysed fact, do not imply our endorsement, and do
          not breach the rules above. Attribution is appreciated but not required.
        </p>
        <p>
          Token names, tickers and images shown on NewEra belong to whoever created them. We
          reproduce them to report what was launched — which includes reproducing names that may
          themselves infringe someone else&apos;s rights. Displaying a token is not a statement about
          the legitimacy of its name.
        </p>
      </Section>

      <Section title="9. Liability">
        <p>
          To the fullest extent permitted by law, NewEra is not liable for any loss arising from your
          use of the service or from any decision you make after reading it. You use it at your own
          risk.
        </p>
      </Section>

      <FootNote />
    </Article>
  )
}

export function Privacy() {
  return (
    <Article
      kicker="Legal"
      title="Privacy Policy"
      standfirst="NewEra needs no account at all. If you do connect a wallet, this policy lists every field we store against it — including what we work out from public blockchain data — and how to have it deleted."
    >
      <Section><Meta /></Section>

      <Section title="1. Our approach">
        <p>
          The live feed, theme pages and API are public, and nothing below is required to use them.
          This policy lists everything we store, including what is collected automatically, so you
          see the whole picture rather than a summary of it.
        </p>
        <p>
          You can see every field held against your own wallet on your{" "}
          <Link to="/account" className="text-acid-500 hover:underline">account page</Link> at any time.
        </p>
      </Section>

      <Section title="2. What we collect">
        <p>
          We never ask for your name or a password, and we never receive your seed phrase or private
          keys. What we do store falls into four groups.
        </p>

        <p><b>Before you connect anything</b> — a random identifier is generated in your browser and sent with each onboarding step, so we can measure how many people drop out and where. It identifies a browser, not a person.</p>
        <Bullets
          items={[
            "A random visitor ID stored in your browser",
            "Which onboarding step you reached, and when",
            "The page you arrived on, the referring site, and any campaign tags in the link",
            "Your browser's user-agent string",
            "A two-letter country code supplied by our network provider. We do not store your IP address.",
          ]}
        />

        <p><b>If you connect a wallet</b> — the address becomes your identifier and the visitor ID above is linked to it.</p>
        <Bullets
          items={[
            "Your wallet address, and the address that signed the login message",
            "The chain you connected on",
            'What you selected when asked why you came ("trade", "launch", "create" or "just looking")',
            "When you first connected, when you last did, and how many times",
          ]}
        />

        <p><b>If you choose to give them</b> — all optional; skipping them changes nothing about what the product does.</p>
        <Bullets
          items={[
            "An email address, plus whether you confirmed it. Confirmation codes are stored only as a hash and expire.",
            "A Telegram or X handle",
          ]}
        />

        <p><b>Derived from public blockchain data</b> — after you connect we read your wallet&apos;s public history and store a summary, used to estimate whether an account is a real person rather than an automated one.</p>
        <Bullets
          items={[
            "Age of the wallet, number of transactions, native balance",
            "How many distinct addresses it has transacted with, and how varied those interactions are",
            "A score derived from the above, with the breakdown that produced it",
          ]}
        />
        <p>
          This information is already public on the blockchain and readable by anyone. We compute
          and cache it; we do not create it.
        </p>
      </Section>

      <Section title="3. What's on the blockchain">
        <p>
          Robinhood Chain is a <b>public ledger</b>. Anything your wallet has ever done on it is
          permanently visible to everyone, with or without NewEra, and outside our control. We
          cannot hide, edit or delete anything recorded on a blockchain — ours or anyone&apos;s.
        </p>
        <Callout tone="warn">
          A wallet address combined with behaviour can identify a person. If your address is
          publicly tied to your identity anywhere, treat everything above as linked to you.
        </Callout>
      </Section>

      <Section title="4. How we use it">
        <Bullets
          items={[
            "To measure how many real people use NewEra, and to distinguish them from automated traffic",
            "To see where the onboarding prompt loses people, so it can be shortened",
            "To save your preferences against your address",
            "To send you something only if you asked for it",
            "To keep the service working, secure and free of abuse",
          ]}
        />
        <p>
          We do not sell your data, share it with advertisers, or build advertising profiles. We do
          not use it to make automated decisions that affect you legally or similarly significantly.
        </p>
      </Section>

      <Section title="5. Sharing &amp; third parties">
        <Bullets
          items={[
            <><b>Blockchain nodes and explorers</b> — to read public chain data</>,
            <><b>Wallet providers</b> — when you connect or sign</>,
            <><b>Hosting and database providers</b> — to run the site and store the above</>,
            <><b>An email provider</b> — only if you supply an email, and only to deliver it</>,
          ]}
        />
        <p>We do not sell your information. We may disclose it where the law requires it.</p>
      </Section>

      <Section title="6. Cookies &amp; local storage">
        <p>NewEra sets no advertising or cross-site tracking cookies. It uses local storage for:</p>
        <Bullets
          items={[
            "The random visitor ID described above",
            "Your connected wallet address and session token, if you connected",
            "Whether you have seen the onboarding prompt, and what you answered",
          ]}
        />
        <p>Clearing your browser storage removes all of them and returns you to an anonymous visitor.</p>
      </Section>

      <Section title="7. Your rights &amp; choices">
        <Bullets
          items={[
            <><b>See it all.</b> Your <Link to="/account" className="text-acid-500 hover:underline">account page</Link> lists every field stored against your address.</>,
            <><b>Delete it.</b> One button erases the record we hold for your wallet — onboarding answers, contact details, session history and the cached wallet summary.</>,
            <><b>Export it.</b> Download a portable copy in one click.</>,
            <><b>Withdraw consent.</b> Remove an email or handle at any time; nothing else changes.</>,
            <><b>Walk away entirely.</b> Disconnect, then clear your browser storage. That removes the visitor ID too.</>,
          ]}
        />
        <p>
          You may also have the right to object to processing, or to complain to your local data
          protection authority. Where we rely on a legal basis under the UK or EU GDPR, it is
          legitimate interest for the analytics described in section 2, and consent for anything you
          volunteered. Requests made by email are answered within one month.
        </p>
        <Callout tone="warn">
          One limit we cannot get around: anything already written to a blockchain is permanent and
          public. Deleting our records does not, and cannot, remove it.
        </Callout>
      </Section>

      <FootNote />
    </Article>
  )
}

export function Risk() {
  return (
    <Article
      kicker="Legal"
      title="Risk Statement"
      standfirst="NewEra is an information service, not a trading venue — but acting on information carries risk. Please read this before you use anything here to make a decision."
    >
      <Section><Meta /></Section>

      <Section title="1. The short version">
        <p>
          NewEra analyses tokens as they launch and publishes what it finds. It cannot tell you what
          a token will be worth, and it does not try to. Most tokens on any chain go to zero,
          including ones this product scores as low risk.
        </p>
      </Section>

      <Section title="2. Analysis is not advice">
        <Bullets
          items={[
            <>A <b>low risk score means &ldquo;this does not look automated&rdquo;</b>. It is not a safety rating, an endorsement, or any indication a token will hold value.</>,
            <>An <b>&ldquo;emerging&rdquo; theme means launches are accelerating</b> across several wallets. It does not mean anyone will buy them.</>,
            <>Our published measurements describe whether tokens were <b>traded at all</b> shortly after launch. Being traded is not the same as being profitable.</>,
            <>We do not verify contracts, audit code, or check whether a token can be rugged.</>,
          ]}
        />
      </Section>

      <Section title="3. Our analysis can be wrong">
        <Bullets
          items={[
            <><b>False negatives.</b> A malicious or worthless launch can look completely clean to us.</>,
            <><b>False positives.</b> A legitimate project can be flagged because someone else launched a similar name minutes earlier.</>,
            <><b>Missing data.</b> Blockchain nodes time out. A token absent from NewEra means nothing about that token.</>,
            <><b>Stale data.</b> Indexing can lag. The feed shows how recently it ran; check it before relying on what you see.</>,
            <><b>Changing methods.</b> We adjust scoring as we learn. A score today may not mean what the same number meant last month.</>,
          ]}
        />
      </Section>

      <Section title="4. Market risk">
        <p>
          Newly launched tokens are among the most speculative assets that exist. On the chain
          NewEra indexes, we have measured that <b>roughly 70% are effectively abandoned within
          thirty minutes</b> of launching.
        </p>
        <Bullets
          items={[
            "There is no guaranteed buyer, resale value, or return on any token.",
            "Liquidity can be removed by a creator at any time, taking the value with it.",
            "Prices can move violently in either direction with no warning and no recourse.",
            "Assume any amount you put into a newly launched token can go to zero.",
          ]}
        />
      </Section>

      <Section title="5. On-chain finality">
        <p>
          NewEra does not execute transactions — but anything you do elsewhere as a result of
          reading it is <b>permanent and irreversible</b>.
        </p>
        <Callout tone="danger">
          Token names and tickers can be deliberately disguised. Two tokens can look identical and
          be different contracts — always verify the address, not the name.
        </Callout>
      </Section>

      <Section title="6. Wallet &amp; security">
        <Bullets
          items={[
            "Signing in to NewEra proves you control an address. It does not authorise any transaction, transfer or approval.",
            "If you lose your seed phrase or private key, your access and assets are gone. No one can restore them.",
            "Phishing sites and malicious approvals are common. Verify you are on the real NewEra, and read everything you sign anywhere.",
            "Never share your seed phrase. NewEra will never ask for it.",
          ]}
        />
      </Section>

      <Section title="7. Technical risk">
        <p>
          NewEra depends on blockchain nodes, third-party infrastructure and our own code, all of
          which can fail. Nodes can return incomplete or incorrect data, outages can stop indexing
          entirely, and as an early-stage product NewEra may have errors, downtime or breaking
          changes.
        </p>
      </Section>

      <FootNote />
    </Article>
  )
}
