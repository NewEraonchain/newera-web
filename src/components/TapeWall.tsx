import { useEffect, useMemo, useRef, useState } from "react"
import gsap from "gsap"
import { getJSON, type Launch } from "@/lib/api"
import Plate from "@/components/Aperture"

/* The tape, at wall scale.
 *
 * A single thin strip of scrolling chips is the ambient decoration every crypto
 * site ships. This is the same live data at the scale it deserves: four rows
 * running at different speeds in alternating directions, tickers set in the
 * display face, with the aperture band cutting across the whole wall so only
 * the row the pointer is on resolves.
 *
 * That last part is the point. The wall is the product's claim made physical —
 * thousands of these a day, all of them illegible noise until something reads
 * them. You cannot look at all of it, which is exactly the problem NewEra
 * exists to solve.
 *
 * Renders nothing if the API is unreachable rather than inventing a tape. */

const ROWS = 4

export default function TapeWall() {
  const [items, setItems] = useState<Launch[]>([])
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    const load = () =>
      getJSON<{ items: Launch[] }>("/intel/feed?limit=200")
        .then((r) => alive && r.items?.length && setItems(r.items))
        .catch((e) => console.error("[TapeWall] feed unavailable:", e))
    load()
    const t = setInterval(load, 45000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const rows = useMemo(() => {
    if (!items.length) return []
    const per = Math.ceil(items.length / ROWS)
    return Array.from({ length: ROWS }, (_, i) => items.slice(i * per, (i + 1) * per))
  }, [items])

  useEffect(() => {
    const el = root.current
    if (!el || !rows.length) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const ctx = gsap.context(() => {
      el.querySelectorAll<HTMLElement>("[data-row]").forEach((track, i) => {
        // Each track holds its list twice, so translating by exactly half its
        // width lands on an identical frame and the reset is invisible.
        const half = track.scrollWidth / 2
        if (half <= 0) return
        const reverse = i % 2 === 1
        // Different speeds per row: identical speeds read as one block sliding,
        // which is the opposite of a tape.
        const pxPerSecond = 34 + i * 11
        gsap.set(track, { x: reverse ? -half : 0 })
        gsap.to(track, {
          x: reverse ? 0 : -half,
          duration: half / pxPerSecond,
          ease: "none",
          repeat: -1,
        })
      })
    }, el)

    return () => ctx.revert()
  }, [rows])

  if (!rows.length) return null

  return (
    <section
      aria-label="Live launches on Robinhood Chain"
      className="relative overflow-hidden border-y border-edge py-[5vh]"
    >
      <Plate rules>
        <div ref={root} className="flex flex-col gap-[1.2vh]">
          {rows.map((row, i) => {
            const doubled = [...row, ...row]
            return (
              <div key={i} data-row className="flex w-max items-baseline gap-[3.2vw] will-change-transform">
                {doubled.map((l, j) => {
                  // Every other consumer guards this; TapeWall did not, and it
                  // is on the entry page. One row without the field replaced the
                  // whole landing page with the error boundary.
                  const flagged = l.riskScore >= 40 || (l.spoofFlags?.length ?? 0) > 0
                  return (
                    <span
                      key={`${l.address}-${j}`}
                      aria-hidden={j >= row.length}
                      className="flex flex-none items-baseline gap-[0.8vw]"
                    >
                      <span
                        className="font-display text-[clamp(1.6rem,3.6vw,3.4rem)] font-extrabold uppercase leading-none tracking-[-0.03em]"
                        style={{ fontStretch: `${62 + ((j * 7) % 26)}%` }}
                      >
                        {l.symbol || "—"}
                      </span>
                      <span
                        className={`font-mono text-micro ${flagged ? "text-danger" : "text-fg-dim"}`}
                      >
                        {l.riskScore}
                      </span>
                    </span>
                  )
                })}
              </div>
            )
          })}
        </div>
      </Plate>

      {/* Ends fade so items enter and leave rather than being cut off. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[14vw] bg-gradient-to-r from-ink-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[14vw] bg-gradient-to-l from-ink-950 to-transparent" />
    </section>
  )
}
