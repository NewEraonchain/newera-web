import { useEffect, useRef, type ElementType, type ReactNode } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { SplitText } from "gsap/SplitText"
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin"

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin)

/* The display type system.
 *
 * This was the kinetic type system: Anybody carries a width axis from 50 to 150
 * and scroll velocity drove it, so every display heading compressed as the page
 * moved and released as it settled. On the built site that reads as text
 * stretching in and out while you scroll, and it was reported that way. The
 * axis is now only ever set, never animated — see KineticText.
 *
 * All of it degrades to ordinary text: the axes sit at their set values, the
 * digits render as digits, the characters render as characters. */

const still = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/* Display text set on the width axis. Static.
 *
 * THE AXIS NO LONGER ANSWERS THE SCROLL. An effect nobody asked for, running on
 * the words they are trying to read, is a cost rather than a signature.
 *
 * The width axis is still the reason for the face: `base` differs per heading,
 * and each line of the hero carries its own, which is a composition no static
 * family can set from one file. It just holds still now.
 *
 * This also removed what the animation had dragged in behind it. Driving the
 * axis re-broke wrapping text every frame, which changed each heading's height,
 * its panel's, and the document's - 136 document-height changes and 215 layout
 * shifts in a single pass, CLS 8.7 against a 0.1 threshold. The fix for that was
 * to split every heading into `nowrap` lines so compression could not move text
 * between them, and that split landed 1.6-1.9s after first paint, re-rendering
 * the heading well into the read. A static axis reflows nothing, so the
 * SplitText, the shared velocity ticker and its scroll listener are all gone
 * with it. */
export function KineticText({
  children,
  base = 72,
  className = "",
  as: Tag = "span",
}: {
  children: string
  /** Width, in font-stretch percent. */
  base?: number
  /** Accepted and ignored - the axis is no longer velocity-driven. */
  amount?: number
  className?: string
  as?: ElementType
}) {
  return (
    <Tag className={className} style={{ fontStretch: `${base}%` }}>
      {children}
    </Tag>
  )
}

/* A live figure, set in tabular numerals so its columns never shuffle.
 *
 * THE DIGITS USED TO ROLL AND IT WAS A DEFECT, NOT AN EFFECT. Every changed
 * digit ran the `roll` keyframe, which begins at `translateY(0.9em)` with
 * `opacity: 0` inside an `overflow-hidden` box - so for the first part of its
 * 520ms that digit is both transparent and outside its own box, which is to say
 * absent. The header's block height changes every eight seconds, several digits
 * at a time, so it spent much of every minute reading as a number with holes in
 * it: a capture of the hero caught "25,02 , 38" while the chain was at
 * 25,022,338. The comment here used to claim this "looks like a counter and not
 * a repaint". It looked like a rendering fault, and was reported as one.
 *
 * A real odometer needs the outgoing digit travelling out as the incoming one
 * arrives, so the column is never empty. That is worth building only if a
 * ticking figure has to sell something, and this one does not - it is a block
 * height in 11px mono. React already replaces only the text, `tabular-nums`
 * holds every column still, and the number simply ticks. */
export function ResolveText({
  children,
  className = "",
  duration = 1.1,
}: {
  children: string
  className?: string
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || still()) return
    const ctx = gsap.context(() => {
      gsap.to(el, {
        duration,
        scrambleText: { text: children, chars: "upperAndNumbers", speed: 0.7, revealDelay: 0.15 },
        ease: "none",
        scrollTrigger: { trigger: el, start: "top 92%", once: true },
      })
    }, el)
    return () => ctx.revert()
  }, [children, duration])

  return (
    <span className={className}>
      {/* The real string is always in the DOM for assistive tech and search;
          the scramble only ever runs in the aria-hidden copy. */}
      <span className="sr-only">{children}</span>
      <span ref={ref} aria-hidden>
        {children}
      </span>
    </span>
  )
}

/* Lines that rise from behind a mask.
 *
 * SplitText ships free with GSAP 3.13 onward, and `mask: "lines"` wraps each
 * line in its own overflow-hidden box - so the lines are genuinely uncovered
 * rather than sliding under a gradient. This is the mechanic that reads as
 * typeset rather than animated.
 *
 * Split after fonts settle: splitting against a fallback face measures the
 * wrong line breaks and the mask ends up cutting mid-glyph. autoSplit re-runs
 * the split on resize for the same reason. */
export function SplitLines({
  children,
  className = "",
  as: Tag = "div",
  stagger = 0.09,
  delay = 0,
  start = "top 86%",
}: {
  children: ReactNode
  className?: string
  as?: ElementType
  stagger?: number
  delay?: number
  start?: string
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || still()) return

    let split: SplitText | null = null
    const ctx = gsap.context(() => {
      const run = () => {
        split = SplitText.create(el, {
          type: "lines",
          mask: "lines",
          autoSplit: true,
          linesClass: "split-line",
          onSplit(self) {
            return gsap.from(self.lines, {
              yPercent: 108,
              duration: 0.95,
              ease: "expo.out",
              stagger,
              delay,
              scrollTrigger: { trigger: el, start, once: true },
            })
          },
        })
      }
      if (document.fonts?.status === "loaded") run()
      else document.fonts?.ready.then(run)
    }, el)

    return () => {
      split?.revert()
      ctx.revert()
    }
  }, [children, stagger, delay, start])

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  )
}
