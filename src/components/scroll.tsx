import { useEffect, useRef, type ElementType, type ReactNode } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

/* The site's scroll motion, in one place.
 *
 * Lenis owns the scroll position and gsap.ticker drives it (see SmoothScroll);
 * everything here hangs off ScrollTrigger, so every effect is linked to that
 * same interpolated position rather than to raw wheel events. That is what
 * makes it feel continuous instead of twitchy.
 *
 * Two gestures, used everywhere, so this reads as a system rather than a pile
 * of effects: THE WIPE (a clip-path uncovering something, which is what the
 * aperture does) and THE DRAW (a rule scaling in from its origin). Nothing
 * fades in from nowhere — a fade says nothing about what the page is.
 *
 * Everything is visible by default. Entrances use fromTo with
 * immediateRender:false so the hidden state is only applied when the trigger
 * fires, and reduced motion skips the lot. */

const still = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

type CommonProps = {
  children: ReactNode
  className?: string
  as?: ElementType
  delay?: number
}

/** Uncovered from below. The workhorse for headings and prose blocks. */
export function Rise({ children, className = "", as: Tag = "div", delay = 0 }: CommonProps) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || still()) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { clipPath: "inset(0 0 100% 0)", y: 18 },
        {
          clipPath: "inset(0 0 -8% 0)",
          y: 0,
          duration: 0.85,
          delay,
          ease: "expo.out",
          immediateRender: false,
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        }
      )
    }, el)
    return () => ctx.revert()
  }, [delay])

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  )
}

/** Uncovered left to right — the same gesture the case file's record uses. */
export function Wipe({ children, className = "", as: Tag = "div", delay = 0 }: CommonProps) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || still()) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { clipPath: "inset(0 100% 0 0)" },
        {
          clipPath: "inset(0 -2% 0 0)",
          duration: 0.9,
          delay,
          ease: "expo.out",
          immediateRender: false,
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        }
      )
    }, el)
    return () => ctx.revert()
  }, [delay])

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  )
}

/** Direct children arrive one after another, each on the wipe. */
export function Stagger({
  children,
  className = "",
  as: Tag = "div",
  each = 0.07,
}: CommonProps & { each?: number }) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || still()) return
    const ctx = gsap.context(() => {
      const kids = Array.from(el.children)
      if (!kids.length) return
      gsap.fromTo(
        kids,
        { clipPath: "inset(0 0 100% 0)", y: 14 },
        {
          clipPath: "inset(0 0 -8% 0)",
          y: 0,
          duration: 0.7,
          ease: "expo.out",
          stagger: each,
          immediateRender: false,
          scrollTrigger: { trigger: el, start: "top 86%", once: true },
        }
      )
    }, el)
    return () => ctx.revert()
  }, [each])

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  )
}

/** A hairline that draws itself in as its section arrives. */
export function RuleDraw({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || still()) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: 1.1,
          ease: "expo.out",
          immediateRender: false,
          scrollTrigger: { trigger: el, start: "top 92%", once: true },
        }
      )
    }, el)
    return () => ctx.revert()
  }, [])

  return (
    <span
      ref={ref}
      aria-hidden
      className={`block h-px w-full origin-left bg-edge-strong ${className}`}
    />
  )
}

/** Scrubbed vertical drift. Genuinely scroll-linked: position is a function of
    scroll, not of time, so it tracks Lenis exactly. */
export function Parallax({
  children,
  className = "",
  as: Tag = "div",
  distance = 60,
}: CommonProps & { distance?: number }) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || still()) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { y: distance },
        {
          y: -distance,
          ease: "none",
          scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 0.8 },
        }
      )
    }, el)
    return () => ctx.revert()
  }, [distance])

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  )
}

/* A band of legibility driven by scroll rather than by the pointer.
 *
 * The landing's aperture follows the cursor because the visitor is exploring.
 * On a page being read top to bottom the band tracks reading position instead,
 * which keeps the mechanic without asking anyone to wave a mouse at a document. */
export function ScrollBand({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || still()) return
    if (!window.matchMedia("(pointer: fine)").matches) return

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el,
        start: "top bottom",
        end: "bottom top",
        scrub: true,
        onUpdate: (self) => {
          // The band sweeps the block as it crosses the viewport.
          const h = 30
          const top = Math.max(0, Math.min(100 - h, self.progress * 100 - h / 2))
          el.style.setProperty("--ap-top", `${top}%`)
          el.style.setProperty("--ap-bot", `${100 - top - h}%`)
        },
      })
    }, el)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={ref} className={`plate ${className}`}>
      {children}
      <span aria-hidden className="ap-scrim ap-scrim-top" />
      <span aria-hidden className="ap-scrim ap-scrim-bot" />
    </div>
  )
}

/* A hairline down the left edge that fills with reading progress. The page's
   own position, in the same mark the aperture uses. */
export function ProgressRail() {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || still()) return
    const ctx = gsap.context(() => {
      gsap.to(el, {
        scaleY: 1,
        ease: "none",
        scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 0.4 },
      })
    })
    return () => ctx.revert()
  }, [])

  return (
    <span
      aria-hidden
      className="pointer-events-none fixed inset-y-0 left-0 z-40 w-px bg-white/[.06]"
    >
      <span ref={ref} className="block h-full w-px origin-top scale-y-0 bg-acid-500/70" />
    </span>
  )
}
