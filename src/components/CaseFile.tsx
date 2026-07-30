import { useEffect, useRef, useState } from "react"
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
    // Recent clusters are more persuasive than old ones: the point is that this
    // is happening now, not that it happened once.
    Math.max(0, 120 - t.ageMinutes) * 0.15
  )
}

export default function CaseFile() {
  const [theme, setTheme] = useState<Theme | null>(null)
  const root = useRef<HTMLDivElement>(null)

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

  /* The page's one authored moment: the record assembling itself, row by row,
     the way it assembled on-chain.
   *
   * fromTo with immediateRender:false rather than gsap.from. from() applies its
   * initial state the instant the tween is built, which leaves every target at
   * opacity 0 from page load until a scroll event arrives — so anything that
   * renders without scrolling shows blank sections. Here the hidden state is
   * set only when the trigger fires, and the trigger fires while the block is
   * still below the fold, so the record is visible by default and the snap
   * never happens on screen. */
  useEffect(() => {
    const el = root.current
    if (!el || !theme) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const ctx = gsap.context(() => {
      const rows = gsap.utils.toArray<HTMLElement>("[data-record-row]")
      if (!rows.length) return
      gsap.fromTo(
        rows,
        { opacity: 0, y: 14 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          ease: "expo.out",
          stagger: 0.06,
          immediateRender: false,
          scrollTrigger: { trigger: el, start: "top bottom", once: true },
        }
      )
    }, el)

    return () => {
      ctx.revert()
    }
  }, [theme])

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
          {/* A ruled record rather than a card. The rules do the grouping that a
              border-and-background container would otherwise do, which keeps the
              tape, the roster and the annotations on one flat plane. */}
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
          <div className="mt-5 border-t border-edge">
            {theme.samples.map((s, i) => {
              const isDupe = (bySymbol.get(s.symbol)?.length || 0) > 1
              return (
                <div
                  key={s.address}
                  data-record-row
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-edge py-3.5"
                >
                  <span className="w-6 shrink-0 font-mono text-micro text-fg-dim">{i + 1}</span>
                  <span className="font-mono text-sm font-semibold text-fg">{s.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{s.name}</span>
                  {isDupe && (
                    <span className="rounded bg-warn/15 px-1.5 py-0.5 font-mono text-micro font-semibold text-warn">
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
            <p className="measure mt-8 text-base leading-relaxed text-fg-muted" data-record-row>
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
