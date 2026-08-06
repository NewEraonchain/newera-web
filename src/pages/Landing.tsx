import { Link } from "react-router-dom"
import { useLayoutEffect, useRef, useState } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import CountUp from "@/components/CountUp"
import TapeWall from "@/components/TapeWall"
import CaseFile from "@/components/CaseFile"
import SpoofScan from "@/components/SpoofScan"
import Plate from "@/components/Aperture"
import KineticHeading from "@/components/KineticHeading"
import StackPanel from "@/components/StackPanel"
import { Rise, Stagger, RuleDraw } from "@/components/scroll"
import { ClusterField, RiskHistogram, CadenceStrip } from "@/components/figures"
import LaunchField from "@/components/LaunchField"
import { KineticText, RollingNumber, SplitLines } from "@/components/kinetic"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { type Stats } from "@/lib/api"
import { useStats } from "@/lib/useStats"

gsap.registerPlugin(ScrollTrigger)

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/* The pipeline, in the order it runs. The sequence carries information — each
   stage only has inputs because the one before it ran — so it is numbered.
   None of these have a label above the heading: the heading carries it. */
const STEPS: {
  n: string
  title: string
  body: string
  points: string[]
  stat: (s: Stats) => string
  statLabel: string
}[] = [
  {
    n: "01",
    stat: (s) => s.launchesLast24h.toLocaleString("en-US"),
    statLabel: "launches indexed in the last 24 hours",
    title: "Watch every launchpad, not one",
    body:
      "Discovery is chain-wide rather than tied to one launchpad — watching a single factory captures about a fifth of the market, and most launchpad contracts publish nothing readable. NewEra watches the one event every token emits when its supply is minted.",
    points: [
      "Position NFTs, LP tokens and existing contracts filtered out",
      "Creator and stake read from the launch transaction itself",
    ],
  },
  {
    n: "02",
    stat: (s) => String(s.activeThemes),
    statLabel: "clusters active right now",
    title: "Cluster by meaning, not by ticker",
    body:
      "Names are normalised and grouped so variations of one idea land together. “Trust in Trump”, “Trump Trust” and “Trumpp” are one narrative, visible while it is still forming.",
    points: [
      "Word-overlap and edit-distance matching",
      "Velocity tracked per cluster — rate of change, not a total",
    ],
  },
  {
    n: "03",
    stat: (s) => `${s.duplicatePct}%`,
    statLabel: "of the last 24 hours duplicate something minutes old",
    title: "Flag the copies at block zero",
    body:
      "Most launches copy something minutes old. Some go further: a ticker padded with an invisible character, or Latin letters swapped for Cyrillic lookalikes, renders identically to the token it imitates.",
    points: [
      "Invisible characters and cross-alphabet lookalikes folded and flagged",
      "Spoofs cluster with what they imitate instead of hiding beside it",
    ],
  },
  {
    n: "04",
    stat: (s) => s.distinctCreators24h.toLocaleString("en-US"),
    statLabel: "distinct creators in the last 24 hours",
    title: "Tell a narrative from one wallet talking to itself",
    body:
      "Thirty launches from one address is not a trend. Creator count sits beside every launch count, so a cluster only reads as emerging when independent wallets are launching into it.",
    points: [
      "Creator reputation from launch history: bursts, duplicates, stake",
      "Clusters ranked so genuinely emerging ones surface first",
    ],
  },
]

/* Real strings, not illustrations. Both are set in the mono because it is the
   only face on the site carrying a Cyrillic subset — in a face without one the
   substituted characters would fall back to a different font and the mismatch
   would give the spoof away, which is the opposite of the point. */
const SPOOFS = [
  {
    shown: "SOLANA",
    real: "SОLАNА",
    note: "Cyrillic О and А substituted for their Latin lookalikes",
    flag: "HOMOGLYPH",
  },
  {
    shown: "PEPE",
    real: "PEPE⁠",
    note: "Word joiner appended — invisible on screen, a different string underneath",
    flag: "INVISIBLE_CHARS",
  },
]

const FAQ = [
  {
    q: "Does NewEra predict which tokens will go up?",
    a: "No, and we would rather say so plainly. What is measured is survival — whether anyone traded a token at all after it launched. On that measure the risk score separates outcomes sharply, and the current multiple is shown further down this page with the number of launches it was measured over, rather than quoted from a run nobody can check. It is not a price forecast.",
  },
  {
    q: "How is this different from a trading terminal?",
    a: "Terminals index transactions, so a token has to trade before they can show you anything. Attention platforms need an audience it does not have yet. Both are blind during the first minutes — the entire window that matters for a new launch. NewEra indexes name, ticker, creator and stake, the only data that exists at block zero.",
  },
  {
    q: "How current is the feed?",
    /* "Nine to ten minutes" was a frozen measurement. Re-measured against the
       chain head today it sat around six to seven, and a subagent measuring two
       hours earlier got two to five — the gap moves through the day because the
       cursor advances in batches. A fixed number here is wrong whichever number
       you pick, so the FAQ describes the shape and points at the live figure the
       feed header now publishes. */
    a: "Not instant, and the gap moves. Ingest typically runs a few minutes behind the chain head, and the live feed prints how far behind it is at the top of the page rather than asking you to trust a number written here. You still see a launch long before it has a price, which is the window this exists for.",
  },
  {
    q: "What does it cost?",
    /* Watchlists and alerts do not exist. /account says so in as many words —
       "Watchlists and alerts don't exist yet" — so the landing page was selling
       a feature the account page apologises for. A wallet is for trading, which
       is the thing it is actually for. */
    a: "Nothing. The feed, cluster pages and API are free and public, with no account. Connecting a wallet is only needed to trade from inside the app; you sign every transaction yourself and we never take custody.",
  },
  {
    q: "What does the risk score actually measure?",
    a: "How much a launch resembles machine-generated noise: whether its name duplicates something minutes old, whether its ticker uses invisible or lookalike characters, how many tokens its creator has fired off, and whether they staked anything. High means “this looks manufactured”, not “this is a bad investment”.",
  },
]

export default function Landing() {
  return (
    <>
      <Hero />
      <TapeWall />
      <CaseFile />
      <BlockZero />
      <Pipeline />
      <Detection />
      <Evidence />
      <Questions />
      <Close />
    </>
  )
}

/* ── Hero ─────────────────────────────────────────────────────────────── */

function Hero() {
  const live = useStats()

  return (
    /* Full bleed: -mt-16 cancels main's top padding, which the other surfaces
       still need. Type anchored to the lower left at plate scale and allowed to
       run past the right edge — the composition is a crop of something larger,
       not a centred block with room around it. */
    <section className="relative -mt-16 flex min-h-svh flex-col justify-end overflow-hidden px-[var(--gutter)] pb-[7vh] pt-[20vh]">
      {/* Atmosphere over the argument, never the argument: every point is a
          real launch from the live window, and the section reads without it. */}
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-90">
        <LaunchField />
      </div>
      <Plate rules>
        <KineticHeading
          className="text-[clamp(3.2rem,15.2vw,16rem)] leading-[0.79] tracking-[-0.028em]"
          lines={[
            { text: "See it", width: 78, weight: 800 },
            { text: "before it", width: 112, weight: 600 },
            { text: "has a price", width: 64, weight: 900 },
          ]}
        />
      </Plate>

      <div className="mt-[3.4vh] flex flex-wrap items-baseline gap-x-9 gap-y-4 font-mono text-xs text-fg-dim">
        <Link
          to="/app"
          className="bg-acid-500 px-5 py-3 text-[11px] uppercase tracking-[0.1em] text-ink-950 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid-500"
        >
          Open the feed →
        </Link>
        {live && (
          <>
            <span>
              <RollingNumber value={live.launchesLastHour} className="font-medium text-fg" /> launches indexed in the
              last hour
            </span>
            <span>
              {/* "of them" attached a 24-hour percentage to an hourly count.
                  `duplicatePct` is duplicatesLast24h over launchesLast24h; the
                  line above it counts the last HOUR, so the two numbers were
                  describing different populations and the pronoun tied them
                  together. The percentage names its own window now. */}
              <b className="font-medium text-fg">{live.duplicatePct}%</b> of the last 24 hours are
              copies
            </span>
          </>
        )}
      </div>
    </section>
  )
}

/* ── The mechanism ────────────────────────────────────────────────────── */

function BlockZero() {
  return (
    <StackPanel tone={2} exit="tilt">
      {/* The one section that breaks the grid.
       *
          Every other section on this page is flush left in the first third,
          and by the third one the eye has learned the pattern and stopped
          looking. This is the page's central claim, so it is the one that gets
          a different shape: centred, at argument scale, with the two halves of
          the reasoning set either side of the axis. Consistency is not the same
          as sameness — a rule-based system still has to make more than one
          shape. */}
      <div className="px-[var(--gutter)] py-24 text-center sm:py-32">
        <RuleDraw className="mb-16" />
        <Rise><KineticText as="h2" className="font-display mx-auto max-w-[15ch] text-[clamp(2.6rem,7.4vw,6.6rem)] font-extrabold uppercase leading-[0.9] tracking-[-0.03em]" base={72} amount={0.30}>{'Nobody else can show you this, and it is not because they are worse'}</KineticText></Rise>
        <div className="mx-auto mt-12 grid max-w-5xl gap-x-16 gap-y-6 text-left lg:grid-cols-2">
          <p className="measure text-base leading-relaxed text-fg-muted">
            A trading terminal indexes transactions, so a token has to trade before it can show
            you anything. An attention platform needs an audience the token does not have yet.
            Both are structurally blind for the first minutes — which is the entire window in
            which the outcome is decided.
          </p>
          <p className="measure text-base leading-relaxed text-fg-muted">
            At block zero exactly four things exist: a name, a ticker, a creator, and whatever
            they staked. That is not much. It is also enough to tell you that forty tokens with
            this name appeared in the last four minutes, and that this ticker is one invisible
            character away from something you already trust.
          </p>
        </div>

        {/* The claim above, drawn. Every mark is a cluster live in the index
            right now: high up the vertical with nothing along the horizontal is
            one wallet talking to itself. */}
        <div className="mt-[9vh]">
          <ClusterField />
        </div>
      </div>
    </StackPanel>
  )
}

/* ── Pipeline ─────────────────────────────────────────────────────────── */

/* The page's one pinned moment. The stages are a sequence — each has inputs
   only because the previous one ran — so moving through them sideways while the
   section holds is the scroll doing the same thing the pipeline does.
 *
 * Desktop only, via gsap.matchMedia. ScrollTrigger.matchMedia is deprecated and
 * a silent no-op in GSAP 3.15: it throws nothing, the pin simply never engages
 * and the last panel sits clipped off-screen. */
function Pipeline() {
  const root = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const live = useStats()

  useLayoutEffect(() => {
    if (reduced()) return
    const mm = gsap.matchMedia()
    mm.add("(min-width: 900px)", () => {
      const el = track.current
      if (!el) return
      const distance = () => el.scrollWidth - window.innerWidth + 80
      if (distance() <= 0) return
      gsap.to(el, {
        x: () => -distance(),
        ease: "none",
        scrollTrigger: {
          trigger: root.current,
          start: "top top",
          end: () => `+=${distance()}`,
          pin: true,
          /* Translate the pinned section, do not fix it.
           *
           * GSAP's default pinType is "fixed": it swaps the element to
           * position:fixed and inserts a spacer of the same size. The browser
           * scores that swap as a layout shift of the whole section, twice —
           * once entering the pin and once leaving. Measured while scrolling
           * the landing page: two shifts of 1.00 and 0.986, from one section
           * reporting height 0 then 900. Total CLS 2.0 against a 0.1 "good"
           * boundary, and none of it visible, which is why it survived every
           * look at the page and only a scrolling measurement found it.
           *
           * "transform" pins by translating instead. Nothing changes position
           * in the layout tree, so there is nothing to score. It is also the
           * mode GSAP documents for a Lenis-driven scroller. */
          pinType: "transform",
          scrub: 0.6,
          invalidateOnRefresh: true,
          anticipatePin: 1,
          // The rule under the heading fills as the track advances, so the pin
          // says how far through the sequence you are. Without it a pinned
          // section reads as the page having stopped responding.
          onUpdate: (self) => {
            gsap.set("[data-pipeline-progress]", { scaleX: self.progress })
          },
        },
      })
    })
    return () => {
      mm.revert()
    }
    /* Presence, not the object. `live` is a fresh object from the stats poll
       every eight seconds, and depending on it tore the pin down and rebuilt
       it on every one — measured: four polls, twelve pin-spacer mutations.
       Idle that is merely wasteful, but a rebuild during a scroll recreates
       the scrubbed tween and the track snaps back to it. The cards are
       `flex-none` at a fixed width, so the live block changes their height and
       never the distance this pin scrolls; the only transition that matters
       here is the stats arriving at all. */
  }, [!!live])

  return (
    <section
      ref={root}
      /* pt-28, not pt-16: a pinned section becomes position:fixed, so main's
         top padding stops applying and the heading slides under the header. */
      className="relative flex min-h-screen flex-col justify-center overflow-hidden border-b border-edge bg-ink-950 pb-16 pt-28"
    >
      <div className="w-full px-[var(--gutter)]">
        <RuleDraw className="mb-16" />
        <Rise><KineticText as="h2" className="font-display max-w-[20ch] text-[clamp(1.7rem,3.4vw,2.9rem)] font-extrabold uppercase leading-[0.9] tracking-[-0.03em]" base={72} amount={0.30}>{'Four stages, in the order they run'}</KineticText></Rise>
        <div className="mt-8 h-px w-full bg-edge">
          <div
            data-pipeline-progress
            className="h-px w-full origin-left scale-x-0 bg-acid-500"
          />
        </div>
      </div>

      <div ref={track} className="mt-12 flex gap-14 px-5 lg:pl-[max(1.25rem,calc((100vw-72rem)/2))]">
        {STEPS.map((s) => (
          <div
            key={s.n}
            className="flex w-[min(88vw,30rem)] flex-none flex-col border-t border-edge-strong pt-6"
          >
            {/* No 01/02/03 label. The heading says the stages run in order and
                the track moves through them in order — the digits restated what
                the structure already carried, which is decoration wearing the
                costume of structure. */}
            <h3 className="text-2xl font-semibold">{s.title}</h3>
            <p className="mt-4 text-sm leading-relaxed text-fg-muted">{s.body}</p>
            <ul className="mt-6 space-y-2.5">
              {s.points.map((p) => (
                <li key={p} className="flex gap-3 text-sm leading-relaxed text-fg-dim">
                  <span aria-hidden className="mt-2 h-px w-3 flex-none bg-edge-strong" />
                  {p}
                </li>
              ))}
            </ul>

            {/* What this stage is doing right now, from the live index. The
                panels were 55% empty and the section read as unfinished; the
                fix is substance rather than tighter margins. */}
            {live && (
              <div className="mt-auto border-t border-edge pt-5">
                <span className="block font-mono text-3xl font-medium text-fg">
                  {s.stat(live)}
                </span>
                <span className="mt-1 block text-xs text-fg-dim">{s.statLabel}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Detection ────────────────────────────────────────────────────────── */

function Detection() {
  return (
    <StackPanel tone={3} exit="drift">
      <div className="px-[var(--gutter)] py-24 sm:py-32">
        <RuleDraw className="mb-16" />
        <Rise><KineticText as="h2" className="font-display max-w-[13ch] text-[clamp(2.6rem,7.4vw,6.6rem)] font-extrabold uppercase leading-[0.9] tracking-[-0.03em]" base={72} amount={0.30}>{'Two tickers that render identically'}</KineticText></Rise>
        <p className="measure mt-6 text-base leading-relaxed text-fg-muted">
          These are the real strings, not pictures of them. Your browser is rendering both right
          now, and if you cannot tell them apart, that is the entire attack.
        </p>

        <Stagger className="mt-14 border-t border-edge-strong" each={0.15}>
          {SPOOFS.map((s) => (
            <SpoofScan key={s.flag} {...s} />
          ))}
        </Stagger>
      </div>
    </StackPanel>
  )
}

/* ── Evidence ─────────────────────────────────────────────────────────── */

function Evidence() {
  const live = useStats()

  return (
    <StackPanel light exit="recede">
      <div className="px-[var(--gutter)] py-24 sm:py-32">
        <RuleDraw className="mb-16" />
        <Rise><KineticText as="h2" className="font-display max-w-[20ch] text-[clamp(1.7rem,3.4vw,2.9rem)] font-extrabold uppercase leading-[0.9] tracking-[-0.03em]" base={72} amount={0.30}>{'Measured, not projected'}</KineticText></Rise>
        <p className="measure mt-6 text-base leading-relaxed text-fg-muted">
          Every figure here is read from the live index when the page loads. There is no longer an
          exception: the survival separation below is measured on request too, and says so when the
          sample is too thin to mean anything.
        </p>

        <Stagger as="dl" className="mt-14 border-t border-edge-strong" each={0.07}>
          {live && (
            <>
              {/* Counts animate from 92% of the target rather than from zero.
                  A count-up from zero spends two seconds displaying a figure
                  that is materially wrong — captured at 6,361 against a real
                  9,172 — which is a strange thing to do beneath the word
                  "Measured". Starting close keeps the number landing, which is
                  the point of the motion, without ever showing a false one. */}
              <Fact
                label="Launches indexed"
                value={
                  <CountUp
                    from={Math.round(live.launchesLast24h * 0.92)}
                    to={live.launchesLast24h}
                    duration={1.1}
                    separator=","
                  />
                }
                unit="in the last 24 hours"
              />
              {/* The percentages and the backtest figure render at their true
                  value immediately, with no count-up.
               *
                  A count-up displays a number that is wrong for the two seconds
                  it runs — a screenshot of this section caught "2.9x" where the
                  measurement is 4.2x, and "31.8%" where it is 46.5%. Under a
                  heading that reads "Measured, not projected", a figure counting
                  up from zero is projecting, and anyone glancing mid-animation
                  reads a false claim. The counts below keep the animation
                  because their size is the point and their exact digit is not;
                  the claims do not. */}
              <Fact
                label="Near-copies"
                value={<>{live.duplicatePct}%</>}
                unit="of them duplicate something minutes old"
              />
              <Fact
                label="High risk"
                value={<>{live.highRiskPct}%</>}
                unit="score above the manufactured-noise threshold"
              />
              <Fact
                label="Distinct creators"
                value={
                  <CountUp
                    from={Math.round(live.distinctCreators24h * 0.92)}
                    to={live.distinctCreators24h}
                    duration={1.1}
                    separator=","
                  />
                }
                unit={`across ${live.activeThemes} active clusters`}
              />
            </>
          )}
          {/* The risk separation used to sit here as a literal "4.2x", in a row
              of figures that are all live — borrowing their credibility for a
              number transcribed once from an admin backtest and never checked
              again. It now belongs to the histogram below, which measures it and
              shows the two populations it comes from. */}
          {/* Read as "no trading happens here" once the swap panel shipped,
              which is not what it says or means. The number is unchanged and
              still zero — it counts signatures NewEra makes — but the label now
              says whose signatures it is counting. */}
          <Fact
            label="Transactions signed by NewEra"
            value={<span>0</span>}
            unit="you sign your own; we hold no keys and never take custody"
          />
        </Stagger>

        <div className="mt-[9vh] grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <RiskHistogram />
          <div>
            <h3 className="text-xl font-semibold">Launches per minute</h3>
            <p className="mt-3 text-sm leading-relaxed text-fg-muted">
              The window the tape above covers, one bar a minute. Volume is the reason none of
              this can be read by hand.
            </p>
            <div className="mt-6">
              <CadenceStrip />
            </div>
          </div>
        </div>
      </div>
    </StackPanel>
  )
}

function Fact({
  label,
  value,
  unit,
}: {
  label: string
  value: React.ReactNode
  unit: string
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-edge py-6">
      <dt className="w-40 shrink-0 font-mono text-micro uppercase tracking-[0.08em] text-fg-dim">
        {label}
      </dt>
      <dd className="flex flex-1 flex-wrap items-baseline gap-x-4">
        <span className="font-mono text-3xl font-medium text-fg">{value}</span>
        <span className="text-sm text-fg-muted">{unit}</span>
      </dd>
    </div>
  )
}

/* ── Questions ────────────────────────────────────────────────────────── */

/* shadcn's accordion rather than a hand-rolled disclosure: it carries the
   keyboard handling, the aria-expanded wiring and the focus management that a
   div with an onClick does not. It is here for behaviour; the styling is ours. */
function Questions() {
  const [open, setOpen] = useState<string>("")

  return (
    <StackPanel tone={4} exit="hold">
      <div className="px-[var(--gutter)] py-24 sm:py-32">
        <RuleDraw className="mb-16" />
        <Rise><KineticText as="h2" className="font-display max-w-[20ch] text-[clamp(1.7rem,3.4vw,2.9rem)] font-extrabold uppercase leading-[0.9] tracking-[-0.03em]" base={72} amount={0.30}>{'The questions worth asking first'}</KineticText></Rise>

        {/* The questions are the composition, not a list of disclosure widgets.
            Each one sits at display scale and unresolved; the open one is the
            only thing the index is looking at, so it alone resolves. That is
            the page's own mechanic applied to a control rather than a generic
            accordion with our colours painted on.

            shadcn still carries the behaviour underneath — keyboard, focus and
            aria-expanded — because rebuilding that by hand is how disclosure
            widgets end up inaccessible. */}
        <Accordion
          type="single"
          collapsible
          value={open}
          onValueChange={setOpen}
          className="mt-14 border-t border-edge-strong"
        >
          {FAQ.map((f, i) => {
            const isOpen = open === f.q
            return (
              <AccordionItem key={f.q} value={f.q} className="border-b border-edge">
                <AccordionTrigger className="group items-start gap-6 py-8 text-left hover:no-underline [&>svg]:mt-3 [&>svg]:size-5 [&>svg]:text-fg-dim">
                  <span className="flex flex-1 items-baseline gap-6">
                    <span className="w-8 shrink-0 font-mono text-micro text-fg-dim">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      /* fg-dim at rest, not unresolved. The aperture never
                         covers something a visitor has to read to choose, and
                         five unreadable questions is a worse FAQ however good
                         it looks. The resolve still happens; it just starts
                         from legible. */
                      className={`font-display text-[clamp(1.3rem,2.9vw,2.3rem)] font-extrabold leading-[1.02] tracking-[-0.02em] transition-colors duration-500 ${
                        isOpen ? "text-fg" : "text-fg-dim group-hover:text-fg"
                      }`}
                      style={{ fontStretch: "74%" }}
                    >
                      {f.q}
                    </span>
                  </span>
                </AccordionTrigger>

                <AccordionContent>
                  <div className="grid gap-6 pb-10 pl-14 sm:grid-cols-[minmax(0,34rem)_1fr]">
                    <SplitLines start="top 98%" stagger={0.06}>
                      <p className="text-base leading-relaxed text-fg-muted">{f.a}</p>
                    </SplitLines>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      </div>
    </StackPanel>
  )
}

/* ── Close ────────────────────────────────────────────────────────────── */

function Close() {
  const live = useStats()

  return (
    <StackPanel tone={0} exit="recede" className="relative flex min-h-svh flex-col justify-end overflow-hidden px-[var(--gutter)] pb-[10vh] pt-[18vh]">
      {/* The field returns for the close, so the page ends where it began. */}
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-70">
        <LaunchField />
      </div>

      <Plate rules>
        <KineticHeading
          as="h2"
          /* Looser than the hero. At 12.5vw a 70% width with -0.03em tracking
             closes the counters on "FEED" until the letters merge; heavy
             condensed type needs the tracking back. */
          className="text-[clamp(2.6rem,11.5vw,12rem)] leading-[0.86] tracking-[-0.015em]"
          lines={[
            { text: "The feed", width: 84, weight: 800 },
            { text: "is open", width: 108, weight: 600 },
            { text: "and free", width: 72, weight: 900 },
          ]}
        />
      </Plate>

      <div className="mt-[4vh] flex flex-wrap items-baseline gap-x-10 gap-y-5 font-mono text-xs text-fg-dim">
        <Link
          to="/app"
          className="block-btn bg-acid-500 text-ink-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid-500"
        >
          Open the live feed →
        </Link>
        <span className="measure-tight leading-relaxed">
          No account, no wallet, no gate. Connect one only when you want to trade from inside the
          app — you sign it yourself, and we hold no keys.
        </span>
        {live && (
          <span>
            <RollingNumber value={live.launchesLast24h} className="font-medium text-fg" /> indexed
            in the last 24 hours
          </span>
        )}
      </div>
    </StackPanel>
  )
}
