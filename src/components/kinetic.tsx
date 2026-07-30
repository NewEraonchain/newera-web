import { useEffect, useLayoutEffect, useRef, useState, type ElementType } from "react"
import gsap from "gsap"

/* The kinetic type system.
 *
 * The hero works because the letterforms themselves respond — Anybody carries a
 * width axis from 50 to 150, and scroll velocity drives it. Everything here
 * extends that one idea so the whole site shares the hero's signature instead
 * of the hero being an exception on an otherwise static page.
 *
 * All of it degrades to ordinary text: the axes settle at their base values,
 * the digits render as digits, the characters render as characters. */

const still = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/* Scroll velocity, shared. One listener and one ticker for the whole page —
   every kinetic element reads the same number, so they compress in sympathy
   rather than each running its own slightly different decay. */
let velocity = 0
let lastY = 0
let listeners = 0
let tickerFn: (() => void) | null = null

function onScroll() {
  velocity = Math.min(Math.abs(window.scrollY - lastY), 90)
  lastY = window.scrollY
}

function useVelocity(apply: (v: number) => void) {
  useEffect(() => {
    if (still()) return
    if (listeners === 0) {
      lastY = window.scrollY
      window.addEventListener("scroll", onScroll, { passive: true })
      tickerFn = () => {
        velocity *= 0.9
      }
      gsap.ticker.add(tickerFn)
    }
    listeners++

    const tick = () => apply(velocity)
    gsap.ticker.add(tick)

    return () => {
      gsap.ticker.remove(tick)
      listeners--
      if (listeners === 0) {
        window.removeEventListener("scroll", onScroll)
        if (tickerFn) gsap.ticker.remove(tickerFn)
        tickerFn = null
      }
    }
  }, [apply])
}

/* Display text whose width axis answers the scroll. The same mechanic as the
   hero, available to any heading on the site. */
export function KineticText({
  children,
  base = 72,
  amount = 0.28,
  className = "",
  as: Tag = "span",
}: {
  children: string
  /** Resting width, in font-stretch percent. */
  base?: number
  /** How hard velocity compresses it. */
  amount?: number
  className?: string
  as?: ElementType
}) {
  const ref = useRef<HTMLElement>(null)

  useVelocity((v) => {
    const el = ref.current
    if (!el) return
    el.style.fontStretch = `${(base - v * amount).toFixed(1)}%`
  })

  return (
    <Tag ref={ref} className={className} style={{ fontStretch: `${base}%` }}>
      {children}
    </Tag>
  )
}

/* Numerals that roll rather than swap.
 *
 * A live figure that changes in place reads as a glitch; a whole number that
 * re-renders reads as a page reload. Only the digits that actually changed
 * move, so a block height ticking up looks like a counter and not a repaint. */
export function RollingNumber({
  value,
  className = "",
}: {
  value: number | string
  className?: string
}) {
  const text = typeof value === "number" ? value.toLocaleString("en-US") : value
  const prev = useRef<string>(text)
  const [chars, setChars] = useState<{ ch: string; changed: boolean; key: string }[]>([])

  useLayoutEffect(() => {
    const before = prev.current
    const next = text.split("").map((ch, i) => {
      // Compare from the right so a digit keeps its identity as the number
      // lengthens: 999 → 1,000 must not repaint every column.
      const fromRight = text.length - i
      const b = before[before.length - fromRight]
      return { ch, changed: before !== text && b !== ch, key: `${i}-${ch}-${fromRight}` }
    })
    setChars(next)
    prev.current = text
  }, [text])

  return (
    <span className={`inline-flex tabular-nums ${className}`}>
      {chars.map((c, i) => (
        <span key={`${c.key}-${i}`} className="relative inline-block overflow-hidden">
          <span className={c.changed ? "inline-block animate-[roll_520ms_cubic-bezier(0.16,1,0.3,1)]" : "inline-block"}>
            {c.ch === " " ? " " : c.ch}
          </span>
        </span>
      ))}
    </span>
  )
}

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>#*"

/* Text that resolves character by character.
 *
 * The page's premise is that things are unresolved until the index reads them,
 * so a label arriving should look like it is being read rather than fading in.
 * Each character settles from a scramble, left to right.
 *
 * The DOM always holds the real string — the scramble is written to a separate
 * span that is aria-hidden, so assistive tech and search never see the noise. */
export function ResolveText({
  children,
  className = "",
  duration = 900,
}: {
  children: string
  className?: string
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const done = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || still()) return

    const target = children
    let raf = 0
    let start = 0

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || done.current) return
        done.current = true
        io.disconnect()

        const step = (t: number) => {
          if (!start) start = t
          const p = Math.min(1, (t - start) / duration)
          const settled = Math.floor(p * target.length)
          let out = target.slice(0, settled)
          for (let i = settled; i < target.length; i++) {
            out += target[i] === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
          }
          el.textContent = out
          if (p < 1) raf = requestAnimationFrame(step)
          else el.textContent = target
        }
        raf = requestAnimationFrame(step)
      },
      { threshold: 0.4 }
    )
    io.observe(el)

    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [children, duration])

  return (
    <span className={className}>
      <span className="sr-only">{children}</span>
      <span ref={ref} aria-hidden>
        {children}
      </span>
    </span>
  )
}
