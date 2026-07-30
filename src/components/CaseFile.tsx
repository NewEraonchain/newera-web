import { useEffect, useLayoutEffect, useRef, useState } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { getJSON, shortAddr, type Theme } from "@/lib/api"

gsap.registerPlugin(ScrollTrigger)

/* The landing page's argument, made on a real cluster rather than described.
 *
 * Everything below is pulled live from /intel/themes at page load. Nothing is
 * authored, nothing is a placeholder, and no figure appears that could not be
 * fetched again by a visitor a second later. That constraint is the product's
 * whole claim, so a marketing page that faked it would be arguing against
 * itself. If the API is unreachable the section renders nothing and the page
 * still reads — the sections around it stand on their own. */

/* A theme is worth showing when it demonstrates the mechanism rather than
   merely existing. Duplicate pairs are the strongest signal — they are the
   thing a chart cannot show you — followed by independent creators, then a
   risk spread wide enough to prove the score discriminates rather than
   labelling everything the same. */
function narrativeScore(t: Theme): number {
  if (!t.samples?.length || t.launchCount < 3) return -1

  const bySymbol = new Map<string, number>()
  for (const s of t.samples) bySymbol.set(s.symbol, (bySymbol.get(s.symbol) || 0) + 1)
  const duplicatePairs = [...bySymbol.values()].filter((n) => n > 1).length

  const risks = t.samples.map((s) => s.riskScore)
  const spread = Math.max(...risks) - Math.min(...risks)

  return (
    duplicatePairs * 50 +
    Math.min(t.creatorCount, 4) * 12 +
    Math.min(spread, 60) * 0.6 +
    Math.max(0, 120 - t.ageMinutes) * 0.15
  )
}

type Bracket = { symbol: string; top: number; height: number }

export default function CaseFile() {
  const [theme, setTheme] = useState<Theme | null>(null)
  const [brackets, setBrackets] = useState<Bracket[]>([])
  const root = useRef<HTMLDivElement>(null)
  const roster = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    getJSON<{ items: Theme[] }>("/intel/themes?limit=40")
      .then((r) => {
        if (!alive || !r.items?.length) return
        const best = r.items
          .map((t) => ({ t, score: narrativeScore(t) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)[0]
        if (best) setTheme(best.t)
      })
      .catch((err) => {
        console.error("[CaseFile] themes unavailable:", err)
      })
    return () => {
      alive = false
    }
  }, [])

  /* Measure where each duplicate group sits so a bracket can be drawn spanning
     exactly those rows. Done from the DOM rather than from row height maths:
     names wrap at narrow widths and the rows are not a uniform height. */
  useLayoutEffect(() => {
    const el = roster.current
    if (!el || !theme) return

    const measure = () => {
      const rows = Array.from(el.querySelectorAll<HTMLElement>("[data-symbol]"))
      const groups = new Map<string, HTMLElement[]>()
      for (const r of rows) {
        const sym = r.dataset.symbol || ""
        groups.set(sym, [...(groups.get(sym) || []), r])
      }
      const next: Bracket[] = []
      for (const [symbol, list] of groups) {
        if (list.length < 2) continue
        const top = Math.min(...list.map((r) => r.offsetTop))
        const bottom = Math.max(...list.map((r) => r.offsetTop + r.offsetHeight))
        next.push({ symbol, top, height: bottom - top })
      }
      setBrackets(next)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      ro.disconnect()
    }
  }, [theme])

  /* The page's focal sequence, and the only place motion carries the voice.
   *
   * The material idea is a record being written and then annotated — which is
   * what the index does. Rows arrive under a left-to-right clip wipe rather
   * than a fade, because a wipe reads as something being written; then the
   * brackets draw down the gutter and the COPY marks land, which is the
   * detector finding the duplicates in front of you. A generic fade-and-rise
   * would say none of that.
   *
   * Scrubbed, so the reader drives the writing. The scroll relationship carries
   * meaning here — the record accumulates as you move through it — which is the
   * condition under which scroll-driven motion earns its place.
   *
   * The trade-off, stated: a scrubbed timeline sets its start state when the
   * trigger initialises, so these rows are hidden before the block is reached.
   * That is acceptable only because it is below the fold — a reader who never
   * scrolls here never sees this section either way. Every other section on the
   * page stays visible by default. */
  useEffect(() => {
    const el = root.current
    if (!el || !theme) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          // Finish writing while the block is still travelling up into view,
          // not across its whole height. Scrubbing the full 1200px left the
          // record visibly half-written for as long as it was the main thing
          // on screen, which reads as broken rather than as authored.
          start: "top 82%",
          end: "top 22%",
          scrub: 0.7,
        },
      })

      tl.from("[data-record-row]", {
        clipPath: "inset(0 100% 0 0)",
        duration: 0.6,
        stagger: 0.25,
        ease: "none",
      })
        .from(
          "[data-symbol]",
          { clipPath: "inset(0 100% 0 0)", duration: 0.5, stagger: 0.2, ease: "none" },
          ">-0.2"
        )
        .from(
          "[data-bracket]",
          { scaleY: 0, duration: 0.5, stagger: 0.15, ease: "none" },
          ">-0.15"
        )
        .from("[data-copy-mark]", { opacity: 0, scale: 0.7, duration: 0.3, stagger: 0.1 }, "<")
        .from("[data-verdict]", { clipPath: "inset(0 100% 0 0)", duration: 0.5, ease: "none" }, ">")
    }, el)

    return () => {
      ctx.revert()
    }
  }, [theme, brackets.length])

  if (!theme) return null

  const bySymbol = new Map<string, typeof theme.samples>()
  for (const s of theme.samples) {
    const list = bySymbol.get(s.symbol) || []
    list.push(s)
    bySymbol.set(s.symbol, list)
  }
  const dupeGroups = [...bySymbol.entries()].filter(([, list]) => list.length > 1)
  const dupeCount = dupeGroups.reduce((n, [, list]) => n + list.length, 0)

  return (
    <section className="border-b border-edge bg-ink-950">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
        <h2 className="max-w-[16ch] text-4xl font-semibold sm:text-5xl">
          One cluster, indexed while you were reading this
        </h2>
        <p className="measure mt-6 text-base leading-relaxed text-fg-muted">
          Not an example. The record below was pulled from the live index when this page loaded,
          and it is the cluster currently doing the most to demonstrate what happens in a token&apos;s
          first hour. Reload and it will likely be a different one.
        </p>

        <div ref={root} className="mt-14">
          <div className="border-t border-edge-strong">
            <Row label="Cluster" data-record-row>
              <span className="text-fg">{theme.label}</span>
            </Row>
            <Row label="First seen" data-record-row>
              <span className="font-mono text-fg">{theme.ageMinutes} min ago</span>
            </Row>
            <Row label="Launches" data-record-row>
              <span className="font-mono text-fg">{theme.launchCount}</span>
              <span className="ml-3 text-fg-dim">
                from {theme.creatorCount} {theme.creatorCount === 1 ? "wallet" : "wallets"}
              </span>
            </Row>
            <Row label="Status" data-record-row>
              <span className={theme.isOrganic ? "text-acid-500" : "text-warn"}>
                {theme.status}
              </span>
              <span className="ml-3 text-fg-dim">
                {theme.isOrganic
                  ? "independent wallets are launching into it"
                  : "concentrated in too few wallets to read as organic"}
              </span>
            </Row>
          </div>

          <h3 className="mt-14 text-xl font-semibold">What was created</h3>

          <div ref={roster} className="relative mt-5 border-t border-edge pl-6">
            {/* The link the detector found, drawn. Each bracket spans exactly
                the rows that share a ticker. */}
            {brackets.map((b) => (
              <span
                key={b.symbol}
                data-bracket
                aria-hidden
                style={{ top: b.top, height: b.height }}
                className="absolute left-0 w-2 origin-top border-y border-l border-warn/60"
              />
            ))}

            {theme.samples.map((s, i) => {
              const isDupe = (bySymbol.get(s.symbol)?.length || 0) > 1
              return (
                <div
                  key={s.address}
                  data-symbol={s.symbol}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-edge py-3.5"
                >
                  <span className="w-6 shrink-0 font-mono text-micro text-fg-dim">{i + 1}</span>
                  <span className="font-mono text-sm font-semibold text-fg">{s.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{s.name}</span>
                  {isDupe && (
                    <span
                      data-copy-mark
                      className="rounded bg-warn/15 px-1.5 py-0.5 font-mono text-micro font-semibold text-warn"
                    >
                      COPY
                    </span>
                  )}
                  <span className="font-mono text-micro text-fg-dim">{shortAddr(s.address)}</span>
                  <span
                    className={`w-8 text-right font-mono text-sm font-semibold ${
                      s.riskScore >= 40 ? "text-danger" : "text-acid-500"
                    }`}
                  >
                    {s.riskScore}
                  </span>
                </div>
              )
            })}
          </div>

          {dupeGroups.length > 0 && (
            <p className="measure mt-8 text-base leading-relaxed text-fg-muted" data-verdict>
              {dupeCount} of these {theme.samples.length} share a ticker with another token in the
              same cluster
              {dupeGroups.length === 1
                ? ` — both trading as ${dupeGroups[0][0]}`
                : ` across ${dupeGroups.length} tickers`}
              . They were created minutes apart, at different addresses. Nothing about a price chart
              would have told you that, because none of them had one yet.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

function Row({
  label,
  children,
  ...rest
}: { label: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 border-b border-edge py-3.5" {...rest}>
      <span className="w-32 shrink-0 font-mono text-micro uppercase tracking-[0.08em] text-fg-dim">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-sm">{children}</span>
    </div>
  )
}
