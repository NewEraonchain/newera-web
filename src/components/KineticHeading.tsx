import { useEffect, useRef } from "react"
import gsap from "gsap"

/* The headline, set on the width axis.
 *
 * Anybody carries wdth 50–150 as well as wght 100–900, and scroll velocity
 * drives the width: the lines compress as the page moves and release as it
 * settles. This is the reason the face was chosen rather than a matter of
 * taste — no static family can do it, and a page that ships a variable face
 * without touching its axes has paid the download cost for nothing.
 *
 * Each line carries its own base width, so the block reads as a set
 * typographic composition rather than three lines at one size. */
export default function KineticHeading({
  lines,
  className = "",
}: {
  lines: { text: string; width: number; weight: number }[]
  className?: string
}) {
  const ref = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const parts = Array.from(el.querySelectorAll<HTMLElement>("[data-line]"))
    let last = window.scrollY
    let vel = 0

    const onScroll = () => {
      // Capped so a flung trackpad does not collapse the line to its minimum.
      vel = Math.min(Math.abs(window.scrollY - last), 90)
      last = window.scrollY
    }
    window.addEventListener("scroll", onScroll, { passive: true })

    const tick = () => {
      vel *= 0.92
      if (vel < 0.05) return
      parts.forEach((p) => {
        const base = Number(p.dataset.width)
        p.style.fontStretch = `${(base - vel * 0.3).toFixed(1)}%`
      })
    }
    gsap.ticker.add(tick)

    return () => {
      window.removeEventListener("scroll", onScroll)
      gsap.ticker.remove(tick)
      parts.forEach((p) => {
        p.style.fontStretch = `${p.dataset.width}%`
      })
    }
  }, [lines])

  return (
    <h1 ref={ref} className={`font-display uppercase ${className}`}>
      {lines.map((l) => (
        <span
          key={l.text}
          data-line
          data-width={l.width}
          style={{ fontStretch: `${l.width}%`, fontWeight: l.weight }}
          className="block whitespace-nowrap"
        >
          {l.text}
        </span>
      ))}
    </h1>
  )
}
