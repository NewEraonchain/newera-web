import { Link } from "react-router-dom"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import Aurora from "@/components/Aurora"
import CountUp from "@/components/CountUp"
import DecryptedText from "@/components/DecryptedText"
import SpotlightCard from "@/components/SpotlightCard"
import ShinyText from "@/components/ShinyText"
import LiveMarquee from "@/components/LiveMarquee"
import Reveal from "@/components/Reveal"
import { getJSON, type Stats } from "@/lib/api"

gsap.registerPlugin(ScrollTrigger)

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/* Every number on this page is measured from live chain data. If a figure here
   can't be reproduced from the API, it shouldn't be here. */
const STATS = [
  { to: 69, suffix: "%", label: "of launches are near-copies of something minutes old" },
  { to: 70, suffix: "%", label: "are effectively dead within thirty minutes" },
  { to: 4.2, suffix: "x", label: "fewer high-risk launches survive their first hour" },
  // Literal rather than counted: "0" is the claim, and watching it tick up from
  // zero to zero would be silly. It is also verifiable — the app holds no keys
  // and signs nothing, which is what the legal pages commit to.
  { to: 0, suffix: "", label: "transactions NewEra performs — it only reads", literal: "0" },
]

const STEPS = [
  {
    n: "01",
    kicker: "Watch",
    title: "Every launch, every launchpad",
    body:
      "Discovery is chain-wide rather than tied to one launchpad — watching a single factory captures about a fifth of the market, and most launchpad contracts publish nothing readable. NewEra watches the one event every token emits when its supply is minted.",
    points: [
      "Position NFTs, LP tokens and existing tokens filtered out",
      "Creator and stake read from the launch transaction",
    ],
  },
  {
    n: "02",
    kicker: "Read",
    title: "Cluster by meaning, not by ticker",
    body:
      "Names are normalised and grouped so variations of one idea land together. “Trust in Trump”, “Trump Trust” and “Trumpp” are one narrative, visible while it is still forming.",
    points: [
      "Word-overlap and edit-distance matching",
      "Velocity tracked per theme — rate of change, not a total",
    ],
  },
  {
    n: "03",
    kicker: "Flag",
    title: "Copies and impersonation, at block zero",
    body:
      "Most launches copy something minutes old. Some go further: a ticker padded with an invisible character, or Latin letters swapped for Cyrillic lookalikes, renders identically to the token it imitates.",
    points: [
      "Invisible characters and cross-alphabet lookalikes folded and flagged",
      "Spoofs cluster with what they imitate instead of hiding beside it",
    ],
  },
  {
    n: "04",
    kicker: "Separate",
    title: "A narrative, or one wallet talking to itself",
    body:
      "Thirty launches from one address is not a trend. Creator count sits beside every launch count, so a cluster only reads as emerging when independent wallets are launching into it.",
    points: [
      "Creator reputation from launch history: bursts, duplicates, stake",
      "Themes ranked so genuinely emerging ones surface first",
    ],
  },
]

const FAQ = [
  {
    q: "Does NewEra predict which tokens will go up?",
    a: "No, and we would rather say so plainly. What is measured is survival — whether anyone traded a token at all after it launched. On that measure the risk score separates outcomes by roughly 4.2x, which makes it a strong filter on noise. It is not a price forecast.",
  },
  {
    q: "How is this different from a trading terminal?",
    a: "Terminals index transactions, so a token has to trade before they can show you anything. Attention platforms need an audience it doesn't have yet. Both are blind during the first minutes — the entire window that matters for a new launch. NewEra indexes name, ticker, creator and stake, the only data that exists at block zero.",
  },
  {
    q: "What does it cost?",
    a: "Nothing. The feed, theme pages and API are free and public. Connecting a wallet is optional and only needed to save a watchlist or set alerts.",
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
      <BlindSpot />
      <HowItWorks />
      <Detection />
      <Evidence />
      <Capabilities />
      <Faq />
      <Finale />
    </>
  )
}

/* ── Hero ─────────────────────────────────────────────────────────────── */

function Hero() {
  const root = useRef<HTMLElement>(null)
  const [live, setLive] = useState<Stats | null>(null)

  useEffect(() => {
    let alive = true
    getJSON<Stats>("/intel/stats")
      .then((s) => {
        if (alive) setLive(s)
      })
      .catch((err) => {
        console.error("[Hero] stats unavailable:", err)
      })
    return () => {
      alive = false
    }
  }, [])

  useLayoutEffect(() => {
    if (reduced()) return
    const ctx = gsap.context(() => {
      // Content drifts up and dims as it leaves; the atmosphere behind it moves
      // slower. Parallax, so the hero reads as depth rather than a flat card
      // sliding away.
      gsap.to("[data-hero-copy]", {
        y: -70,
        opacity: 0.15,
        ease: "none",
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
      })
      gsap.to("[data-hero-glow]", {
        y: 130,
        ease: "none",
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
      })
    }, root)
    return () => {
      ctx.revert()
    }
  }, [])

  return (
    <section ref={root} className="relative flex min-h-[94vh] items-center overflow-hidden">
      <div data-hero-glow className="pointer-events-none absolute inset-x-0 top-0 h-[58vh] opacity-45">
        <Aurora colorStops={["#1d6b4f", "#cdff4d", "#124034"]} amplitude={0.75} blend={0.85} speed={0.45} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[58vh] bg-gradient-to-b from-transparent via-transparent to-ink-950" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-ink-950 to-transparent" />

      <div data-hero-copy className="relative mx-auto w-full max-w-6xl px-5 pt-24">
        <div className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-[rgba(205,255,77,.28)] bg-[rgba(205,255,77,.08)] px-3.5 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-acid-500">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-acid-500 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-acid-500" />
          </span>
          Live on Robinhood Chain
        </div>

        <h1 className="max-w-4xl font-display text-[clamp(2.4rem,7.6vw,5.6rem)] font-bold leading-[0.95] tracking-[-0.035em]">
          See what&apos;s launching
          <br />
          before it has a{" "}
          <span className="text-acid-500">
            <DecryptedText
              text="price"
              animateOn="view"
              sequential
              revealDirection="start"
              speed={55}
              maxIterations={14}
              className="text-acid-500"
              encryptedClassName="text-acid-600 opacity-60"
            />
          </span>
        </h1>

        <p className="mt-7 max-w-2xl text-[clamp(1rem,1.6vw,1.15rem)] leading-relaxed text-fg-muted">
          Tens of thousands of tokens are created every day. At the moment one launches it has no
          chart, no holders and no followers — so every analytics tool is blind to it. NewEra reads
          the only thing that exists yet: what the token <em className="text-fg">means</em>.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            to="/app"
            className="group inline-flex items-center gap-2 rounded-xl bg-acid-500 px-6 py-3.5 text-[15px] font-bold text-[#0a0d05] transition-[filter,transform] hover:brightness-105 active:scale-[.98]"
          >
            Open live feed
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-0.5">
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </Link>
          <Link
            to="/how-it-works"
            className="inline-flex items-center rounded-xl border border-edge-strong px-6 py-3.5 text-[15px] font-semibold text-fg transition-colors hover:border-[rgba(255,255,255,.3)] hover:bg-white/[.03]"
          >
            How it works
          </Link>

          {/* Real counter, or nothing. An invented number on this page would
              undercut the one thing being sold. */}
          {live && (
            <span className="ml-1 font-mono text-[12.5px] text-fg-dim">
              <span className="text-acid-500">{live.launchesLastHour}</span> launches indexed in the
              last hour
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

/* ── The blind spot ───────────────────────────────────────────────────── */

const LINES = [
  "A terminal needs a transaction.",
  "An attention platform needs an audience.",
  "For the first minutes a token has neither.",
]

function BlindSpot() {
  const root = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    if (reduced()) return
    const ctx = gsap.context(() => {
      // Each line brightens as it reaches the middle of the viewport, so the
      // argument lands one clause at a time instead of all at once.
      gsap.utils.toArray<HTMLElement>("[data-line]").forEach((line) => {
        gsap.fromTo(
          line,
          { opacity: 0.16 },
          {
            opacity: 1,
            ease: "none",
            scrollTrigger: { trigger: line, start: "top 78%", end: "top 42%", scrub: true },
          }
        )
      })
    }, root)
    return () => {
      ctx.revert()
    }
  }, [])

  return (
    <section ref={root} className="border-b border-edge bg-ink-950">
      <div className="mx-auto max-w-5xl px-5 py-32 sm:py-44">
        <p className="mb-12 font-mono text-[12px] uppercase tracking-[0.1em] text-acid-500">
          The blind spot
        </p>
        <div className="flex flex-col gap-7">
          {LINES.map((l) => (
            <p
              key={l}
              data-line
              className="font-display text-[clamp(1.6rem,4.4vw,3.1rem)] font-bold leading-[1.12] tracking-[-0.025em]"
            >
              {l}
            </p>
          ))}
        </div>
        <p className="mt-12 max-w-xl text-[15px] leading-relaxed text-fg-muted">
          That window is the entire opportunity, and it is the one window nothing else indexes.
          What does exist at block zero is a name, a ticker, a creator and a stake — so that is
          what NewEra reads.
        </p>
      </div>
    </section>
  )
}

/* ── How it works: horizontal scroll ──────────────────────────────────── */

function HowItWorks() {
  const root = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (reduced()) return
    // gsap.matchMedia, not ScrollTrigger.matchMedia — the latter is deprecated
    // and silently does nothing in GSAP 3.15, which left the panels sitting
    // still with the last one clipped off the right edge.
    //
    // Horizontal panning is a desktop affordance anyway: on a narrow screen it
    // fights the browser's own gesture, so below 900px the panels just scroll
    // sideways by hand.
    const mm = gsap.matchMedia()
    mm.add("(min-width: 900px)", () => {
      const el = track.current
      if (!el) return
      const distance = () => el.scrollWidth - window.innerWidth
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
        },
      })
    })
    return () => {
      mm.revert()
    }
  }, [])

  return (
    /* pt-28 clears the fixed header: once pinned the section is position:fixed
       at the top of the viewport, so main's pt-16 no longer applies to it and
       the heading slid underneath the nav. */
    <section
      ref={root}
      className="relative flex min-h-screen flex-col justify-center overflow-hidden border-b border-edge bg-ink-900 pb-16 pt-28"
    >
      <div className="mx-auto w-full max-w-6xl px-5 lg:px-[max(1.25rem,calc((100vw-72rem)/2))]">
        <p className="mb-3 font-mono text-[12px] uppercase tracking-[0.1em] text-acid-500">
          How it works
        </p>
        <h2 className="max-w-2xl font-display text-[clamp(1.8rem,3.6vw,2.8rem)] font-bold leading-tight tracking-[-0.025em]">
          Four steps, none of which need a price
        </h2>
      </div>

      <div
        ref={track}
        className="mt-12 flex w-max gap-5 px-5 will-change-transform lg:px-[max(1.25rem,calc((100vw-72rem)/2))]"
      >
        {STEPS.map((s) => (
          <article
            key={s.n}
            className="flex w-[min(88vw,30rem)] flex-none flex-col rounded-2xl border border-edge bg-ink-850 p-8"
          >
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[13px] text-acid-500">{s.n}</span>
              <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-dim">
                {s.kicker}
              </span>
            </div>
            <h3 className="mt-5 font-display text-[22px] font-bold leading-snug tracking-[-0.015em]">
              {s.title}
            </h3>
            <p className="mt-4 text-[14.5px] leading-relaxed text-fg-muted">{s.body}</p>
            <ul className="mt-6 flex flex-col gap-2.5 border-t border-edge pt-5">
              {s.points.map((p) => (
                <li key={p} className="flex gap-2.5 text-[13.5px] leading-relaxed text-fg-dim">
                  <span className="mt-[7px] h-1 w-1 flex-none rounded-full bg-acid-500" />
                  {p}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}

/* ── Detection ────────────────────────────────────────────────────────── */

/* Real spoofing techniques, rendered as they would appear on a tape. The
   Cyrillic sample genuinely contains С, О and А — copy it and it will not
   match the Latin string it looks identical to. */
const SPOOFS = [
  {
    shown: "SOLANA",
    real: "SОLАNА",
    note: "Cyrillic О and А substituted for Latin",
    flag: "HOMOGLYPH",
  },
  {
    shown: "PEPE",
    real: "PEPE⁠",
    note: "Word joiner appended — invisible, and a different string",
    flag: "INVISIBLE_CHARS",
  },
]

function Detection() {
  return (
    <section className="border-b border-edge bg-ink-950">
      <div className="mx-auto grid max-w-6xl gap-14 px-5 py-24 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <Reveal>
          <p className="mb-3 font-mono text-[12px] uppercase tracking-[0.1em] text-acid-500">
            Impersonation
          </p>
          <h2 className="font-display text-[clamp(1.8rem,3.6vw,2.6rem)] font-bold leading-tight tracking-[-0.025em]">
            Two tickers that render identically
          </h2>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-fg-muted">
            A ticker padded with a zero-width character, or with Latin letters swapped for Cyrillic
            lookalikes, is a different string to the chain and the same string to your eye. NewEra
            folds both before clustering, so a spoof lands next to the token it imitates instead of
            hiding as a narrative of its own.
          </p>
          <Link
            to="/detection"
            className="mt-7 inline-flex items-center gap-1.5 text-[14px] font-semibold text-acid-500 hover:underline"
          >
            See the method
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </Reveal>

        <Reveal stagger className="flex flex-col gap-3.5">
          {SPOOFS.map((s) => (
            <div key={s.flag} className="rounded-2xl border border-edge bg-ink-850 p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[18px] font-semibold text-fg">{s.shown}</span>
                <span className="text-fg-faint">vs</span>
                <span className="font-mono text-[18px] font-semibold text-danger">{s.real}</span>
                <span className="ml-auto rounded bg-danger/15 px-2 py-1 font-mono text-[10.5px] font-semibold text-danger">
                  {s.flag}
                </span>
              </div>
              <p className="mt-4 text-[13.5px] leading-relaxed text-fg-dim">{s.note}</p>
            </div>
          ))}
          <p className="px-1 font-mono text-[11.5px] leading-relaxed text-fg-faint">
            Both examples are live techniques, not mock-ups.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

/* ── Evidence ─────────────────────────────────────────────────────────── */

function Evidence() {
  return (
    <section className="border-b border-edge bg-ink-900">
      <div className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <p className="mb-3 font-mono text-[12px] uppercase tracking-[0.1em] text-acid-500">
            Measured, not projected
          </p>
          <h2 className="max-w-2xl font-display text-[clamp(1.8rem,3.6vw,2.6rem)] font-bold leading-tight tracking-[-0.025em]">
            What the data actually shows
          </h2>
        </Reveal>

        <Reveal stagger className="mt-14 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="font-display text-[clamp(2.2rem,4.2vw,3.4rem)] font-bold leading-none tracking-[-0.035em] text-acid-500">
                {s.literal ? (
                  s.literal
                ) : (
                  <>
                    <CountUp to={s.to} duration={1.6} separator="," />
                    <span>{s.suffix}</span>
                  </>
                )}
              </div>
              <p className="mt-3.5 max-w-[16rem] text-[13.5px] leading-relaxed text-fg-muted">
                {s.label}
              </p>
            </div>
          ))}
        </Reveal>

        {/* The limit belongs on the landing page, not buried in the docs. It is
            the difference between this and everything else in the category. */}
        <Reveal>
          <div className="mt-16 max-w-2xl rounded-2xl border border-edge bg-ink-850 p-7">
            <p className="text-[14.5px] leading-relaxed text-fg-muted">
              <span className="font-semibold text-fg">What this is not.</span> Survival means
              somebody traded a token at all — not that it made money. NewEra does not forecast
              price, and no number here should be read as a return. It is a filter on noise, and
              that is a different claim.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ── Capabilities ─────────────────────────────────────────────────────── */

const CAPS = [
  {
    to: "/app",
    title: "Live tape",
    body: "Every launch as it happens, with age, creator stake and risk on each row. Filter to clean launches in one click.",
    cta: "Open the feed",
  },
  {
    to: "/themes",
    title: "Theme intelligence",
    body: "Narratives grouped as they form, with velocity, saturation and how many independent wallets are behind each one.",
    cta: "How clustering works",
  },
  {
    to: "/detection",
    title: "Impersonation detection",
    body: "Invisible characters, cross-alphabet lookalikes and duplicate bursts, scored 0–100 from data available at launch.",
    cta: "See the method",
  },
  {
    to: "/docs",
    title: "Open API",
    body: "The same endpoints the site runs on — feed, themes, creators and stats — public and unauthenticated.",
    cta: "Read the docs",
  },
]

function Capabilities() {
  return (
    <section className="border-b border-edge bg-ink-950">
      <div className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <p className="mb-3 font-mono text-[12px] uppercase tracking-[0.1em] text-acid-500">
            What you get
          </p>
          <h2 className="font-display text-[clamp(1.8rem,3.6vw,2.6rem)] font-bold leading-tight tracking-[-0.025em]">
            Everything is free, and public
          </h2>
          <p className="mt-4 max-w-xl text-[15px] text-fg-muted">
            No tiers, no paywall. Connect a wallet only when you want something saved.
          </p>
        </Reveal>

        <Reveal stagger className="mt-12 grid gap-4 sm:grid-cols-2">
          {CAPS.map((c) => (
            <Link key={c.to} to={c.to} className="group block">
              <SpotlightCard
                className="h-full border-edge bg-ink-850 p-7 transition-colors group-hover:border-edge-strong"
                spotlightColor="rgba(205, 255, 77, 0.14)"
              >
                <h3 className="font-display text-[19px] font-bold tracking-[-0.01em]">{c.title}</h3>
                <p className="mt-3 text-[14px] leading-relaxed text-fg-muted">{c.body}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-acid-500">
                  {c.cta}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-0.5">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </SpotlightCard>
            </Link>
          ))}
        </Reveal>
      </div>
    </section>
  )
}

/* ── FAQ ──────────────────────────────────────────────────────────────── */

function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section className="border-b border-edge bg-ink-900">
      <div className="mx-auto max-w-3xl px-5 py-24">
        <Reveal>
          <h2 className="mb-10 font-display text-[clamp(1.8rem,3.6vw,2.6rem)] font-bold tracking-[-0.025em]">
            Frequently asked
          </h2>
        </Reveal>
        <div className="flex flex-col gap-2.5">
          {FAQ.map((f, i) => {
            const isOpen = open === i
            return (
              <div key={f.q} className="overflow-hidden rounded-xl border border-edge bg-ink-850">
                <button
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                >
                  <span className="text-[15px] font-semibold">{f.q}</span>
                  <span className={`flex-none text-acid-500 transition-transform ${isOpen ? "rotate-45" : ""}`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden">
                    <p className="px-6 pb-6 text-[14.5px] leading-relaxed text-fg-muted">{f.a}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ── Finale ───────────────────────────────────────────────────────────── */

function Finale() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <Aurora colorStops={["#1d6b4f", "#cdff4d", "#0a0c12"]} amplitude={0.8} blend={0.5} speed={0.4} />
      </div>
      <div className="relative mx-auto max-w-3xl px-5 py-32 text-center">
        <h2 className="font-display text-[clamp(1.9rem,4.4vw,3.2rem)] font-bold leading-[1.08] tracking-[-0.03em]">
          <ShinyText text="Stop reading charts that don't exist yet." speed={4} />
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-fg-muted">
          Open the live feed and see what is being created right now.
        </p>
        <Link
          to="/app"
          className="mt-9 inline-flex items-center gap-2 rounded-xl bg-acid-500 px-7 py-4 text-[15px] font-bold text-[#0a0d05] transition-[filter,transform] hover:brightness-105 active:scale-[.98]"
        >
          Open live feed
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </Link>
      </div>
    </section>
  )
}
