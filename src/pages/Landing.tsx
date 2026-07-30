import { Link } from "react-router-dom"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { AnimatePresence, motion } from "motion/react"
import CountUp from "@/components/CountUp"
import LiveMarquee from "@/components/LiveMarquee"
import CaseFile from "@/components/CaseFile"
import ChainTicker from "@/components/ChainTicker"
import SpoofScan from "@/components/SpoofScan"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { getJSON, type Stats } from "@/lib/api"

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
    statLabel: "of launches duplicate something minutes old",
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
    a: "No, and we would rather say so plainly. What is measured is survival — whether anyone traded a token at all after it launched. On that measure the risk score separates outcomes by roughly 4.2x, which makes it a strong filter on noise. It is not a price forecast.",
  },
  {
    q: "How is this different from a trading terminal?",
    a: "Terminals index transactions, so a token has to trade before they can show you anything. Attention platforms need an audience it does not have yet. Both are blind during the first minutes — the entire window that matters for a new launch. NewEra indexes name, ticker, creator and stake, the only data that exists at block zero.",
  },
  {
    q: "How current is the feed?",
    a: "Ingest runs roughly nine to ten minutes behind the chain head. That is live in the sense that matters — you see a launch long before it has a price — but it is not instant, and we would rather state the number than imply otherwise.",
  },
  {
    q: "What does it cost?",
    a: "Nothing. The feed, cluster pages and API are free and public. Connecting a wallet is optional and only needed to save a watchlist or set alerts.",
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
      <LiveMarquee />
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
  const [live, setLive] = useState<Stats | null>(null)

  useEffect(() => {
    let alive = true
    const load = () =>
      getJSON<Stats>("/intel/stats")
        .then((s) => {
          if (alive) setLive(s)
        })
        .catch((err) => {
          console.error("[Hero] stats unavailable:", err)
        })
    load()
    const t = setInterval(load, 60000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  return (
    <section className="relative flex min-h-[72vh] items-center border-b border-edge pb-16 pt-28 sm:pb-20">
      <div className="mx-auto w-full max-w-6xl px-5">
        <h1 className="rise max-w-[15ch] text-5xl font-semibold sm:text-6xl lg:text-7xl">
          See what is launching before it has a price
        </h1>

        <p
          className="rise measure mt-8 text-lg leading-relaxed text-fg-muted"
          style={{ animationDelay: "140ms" }}
        >
          Thousands of tokens are created on Robinhood Chain every day. At the moment one
          launches it has no chart, no holders and no followers, so every analytics tool is
          blind to it. NewEra reads the only thing that exists yet: what the token means.
        </p>

        <div
          className="rise mt-10 flex flex-wrap items-center gap-x-6 gap-y-4"
          style={{ animationDelay: "260ms" }}
        >
          <Link
            to="/app"
            className="rounded-lg bg-acid-500 px-6 py-3 text-sm font-semibold text-ink-950 transition-colors hover:bg-acid-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid-500"
          >
            Open the live feed
          </Link>
          <Link
            to="/how-it-works"
            className="rounded-lg border border-edge-strong px-6 py-3 text-sm font-semibold text-fg transition-colors hover:bg-ink-850 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid-500"
          >
            How it works
          </Link>

          {/* Motion's job on this page: the figure changes on its own every
              minute, and a number that swaps in place with no transition reads
              as a glitch. This is state motion — a function of fetched data,
              not of scroll position — which is why it is Motion and not GSAP. */}
          {live && (
            <p className="flex items-baseline gap-2 font-mono text-xs text-fg-dim">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={live.launchesLastHour}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="font-semibold text-acid-500"
                >
                  {live.launchesLastHour}
                </motion.span>
              </AnimatePresence>
              launches indexed in the last hour
            </p>
          )}
        </div>

        {/* The chain height, polled every eight seconds. Robinhood Chain makes
            ten blocks a second, so this visibly moves while you read — and the
            digits that moved are the ones that light up. Never incremented
            locally: a fake counter would look the same and be a lie on the one
            page arguing that the data is honest. */}
        <ChainTicker className="rise mt-8" />
      </div>
    </section>
  )
}

/* ── The mechanism ────────────────────────────────────────────────────── */

function BlockZero() {
  return (
    <section className="border-b border-edge bg-ink-900">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
        <h2 className="max-w-[18ch] text-4xl font-semibold sm:text-5xl">
          Nobody else can show you this, and it is not because they are worse
        </h2>
        <div className="mt-10 grid gap-x-16 gap-y-6 lg:grid-cols-2">
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
      </div>
    </section>
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
  const [live, setLive] = useState<Stats | null>(null)

  useEffect(() => {
    let alive = true
    getJSON<Stats>("/intel/stats")
      .then((s) => {
        if (alive) setLive(s)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

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
  }, [live])

  return (
    <section
      ref={root}
      /* pt-28, not pt-16: a pinned section becomes position:fixed, so main's
         top padding stops applying and the heading slides under the header. */
      className="relative flex min-h-screen flex-col justify-center overflow-hidden border-b border-edge bg-ink-950 pb-16 pt-28"
    >
      <div className="mx-auto w-full max-w-6xl px-5">
        <h2 className="max-w-[20ch] text-4xl font-semibold sm:text-5xl">
          Four stages, in the order they run
        </h2>
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
    <section className="border-b border-edge bg-ink-900">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
        <h2 className="max-w-[18ch] text-4xl font-semibold sm:text-5xl">
          Two tickers that render identically
        </h2>
        <p className="measure mt-6 text-base leading-relaxed text-fg-muted">
          These are the real strings, not pictures of them. Your browser is rendering both right
          now, and if you cannot tell them apart, that is the entire attack.
        </p>

        <div className="mt-14 border-t border-edge-strong">
          {SPOOFS.map((s) => (
            <SpoofScan key={s.flag} {...s} />
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Evidence ─────────────────────────────────────────────────────────── */

function Evidence() {
  const [live, setLive] = useState<Stats | null>(null)

  useEffect(() => {
    let alive = true
    getJSON<Stats>("/intel/stats")
      .then((s) => {
        if (alive) setLive(s)
      })
      .catch((err) => {
        console.error("[Evidence] stats unavailable:", err)
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <section className="border-b border-edge bg-ink-950">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
        <h2 className="max-w-[16ch] text-4xl font-semibold sm:text-5xl">
          Measured, not projected
        </h2>
        <p className="measure mt-6 text-base leading-relaxed text-fg-muted">
          Every figure here is read from the live index when the page loads. The one exception is
          labelled, because it comes from a backtest rather than a counter.
        </p>

        <dl className="mt-14 border-t border-edge-strong">
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
          <Fact
            label="Risk separation"
            value={<>4.2x</>}
            unit="fewer high-risk launches survive their first hour — from backtest, not a counter"
          />
          <Fact
            label="Transactions signed"
            value={<span>0</span>}
            unit="NewEra reads the chain and holds no keys"
          />
        </dl>
      </div>
    </section>
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
  return (
    <section className="border-b border-edge bg-ink-900">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
        <h2 className="max-w-[16ch] text-4xl font-semibold sm:text-5xl">
          The questions worth asking first
        </h2>

        <Accordion type="single" collapsible className="mt-12 border-t border-edge-strong">
          {/* pb-1 so the collapsed content wrapper is not flush against the
              rule below it. */}
          {FAQ.map((f) => (
            <AccordionItem key={f.q} value={f.q} className="border-b border-edge pb-1">
              <AccordionTrigger className="py-6 text-left text-lg font-medium hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent>
                <p className="measure pb-2 text-base leading-relaxed text-fg-muted">{f.a}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}

/* ── Close ────────────────────────────────────────────────────────────── */

function Close() {
  return (
    <section className="bg-ink-950">
      <div className="mx-auto max-w-6xl px-5 py-28 sm:py-36">
        <h2 className="max-w-[14ch] text-4xl font-semibold sm:text-5xl">
          The feed is open, and it is free
        </h2>
        <p className="measure mt-6 text-base leading-relaxed text-fg-muted">
          No account, no wallet, no gate. Connecting a wallet is optional and only saves a
          watchlist.
        </p>
        <Link
          to="/app"
          className="mt-10 inline-block rounded-lg bg-acid-500 px-6 py-3 text-sm font-semibold text-ink-950 transition-colors hover:bg-acid-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid-500"
        >
          Open the live feed
        </Link>
      </div>
    </section>
  )
}
