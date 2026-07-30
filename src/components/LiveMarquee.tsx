import { useEffect, useRef, useState } from "react"
import gsap from "gsap"
import { getJSON, type Launch } from "@/lib/api"

/* A marquee of tokens that were actually created on Robinhood Chain in the last
   few minutes, risk badge and all.
 *
 * This is the most persuasive thing the landing page can do: no competitor can
 * show a tape at block zero, because none of them index anything until a token
 * trades. Claiming that in prose is weak next to letting it run.
 *
 * If the API is unreachable the strip renders nothing rather than inventing
 * placeholder tokens — a fake tape on a page selling honest data would be a
 * strange thing to ship. */
export default function LiveMarquee() {
  const [items, setItems] = useState<Launch[]>([])
  const trackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await getJSON<{ items: Launch[] }>("/intel/feed?limit=24")
        if (alive && r.items?.length) setItems(r.items)
      } catch (err) {
        // Silent failure is how the onboarding funnel stayed broken for hours.
        // The strip still degrades to nothing, but it says why first.
        console.error("[LiveMarquee] feed unavailable:", err)
      }
    }
    load()
    const t = setInterval(load, 45000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track || !items.length) return

    // The track holds the list twice, so translating by exactly half its width
    // lands on an identical frame — the reset is invisible.
    const ctx = gsap.context(() => {
      const half = track.scrollWidth / 2
      gsap.set(track, { x: 0 })
      gsap.to(track, {
        x: -half,
        duration: half / 55, // px per second, not a fixed duration
        ease: "none",
        repeat: -1,
      })
    }, track)

    return () => {
      ctx.revert()
    }
  }, [items])

  if (!items.length) return null

  const doubled = [...items, ...items]

  return (
    <div className="relative overflow-hidden border-y border-edge bg-ink-900/60 py-3">
      {/* Fade the ends so items enter and leave rather than being cut off. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-ink-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-ink-950 to-transparent" />

      <div ref={trackRef} className="flex w-max gap-2.5 will-change-transform">
        {doubled.map((l, i) => {
          const flagged = l.riskScore >= 40 || l.spoofFlags.length > 0
          const dupe = l.dupeCount > 0
          return (
            <div
              key={`${l.address}-${i}`}
              aria-hidden={i >= items.length}
              className="flex flex-none items-center gap-2.5 rounded-lg border border-edge bg-ink-850 px-3.5 py-2"
            >
              <span className="font-mono text-[12.5px] font-semibold tracking-tight text-fg">
                {l.symbol || "—"}
              </span>
              <span className="max-w-[13rem] truncate text-[12.5px] text-fg-dim">{l.name}</span>
              {dupe && (
                <span className="rounded bg-warn/15 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-warn">
                  COPY
                </span>
              )}
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold ${
                  flagged ? "bg-danger/15 text-danger" : "bg-acid-500/12 text-acid-500"
                }`}
              >
                {l.riskScore}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
