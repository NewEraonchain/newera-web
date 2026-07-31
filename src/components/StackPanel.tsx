import { useEffect, useRef, type ReactNode } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

/* Sections that stack, so arriving at one is felt rather than inferred.
 *
 * Each panel sticks to the top of the viewport and the next one rides up over
 * it on its own opaque ground, casting a shadow as it comes. The panel being
 * covered recedes — a small scale down and a dim — so the movement reads as
 * one surface passing in front of another rather than as content scrolling.
 * That is the depth cue; without it the overlap is invisible because both
 * grounds are dark.
 *
 * WHY STICKY AND NOT A ScrollTrigger PIN. Pinning wraps the element in a
 * pin-spacer and takes over its positioning, and this page already runs a pin
 * on the pipeline; stacking a second pinning system on top of it is the exact
 * combination the GSAP forums are full of. Sticky is native and costs nothing.
 * GSAP is left doing the one thing sticky cannot: the recede, which animates the
 * covered panel and never touches scroll position.
 *
 * A TALL PANEL MUST PIN BY ITS BOTTOM EDGE. This file used to claim sticky
 * "degrades to ordinary flow for panels taller than the viewport". It does not.
 * A sticky element taller than the viewport still pins at top:0 and everything
 * past the fold inside it becomes unreachable — you cannot scroll within it, and
 * the next panel arrives over the part you never saw. Measured at 1440x900: the
 * panels ran 973–1856px against a 900px viewport, and the last block of three of
 * them was never more than 12% visible, the risk figures among them.
 *
 * So `top` is computed per panel: 0 when it fits, and -(height - viewport) when
 * it does not, which pins it by the bottom instead. The panel then travels fully
 * through the viewport before locking, and what it holds while covered is its
 * end — which is the edge the next panel arrives at anyway.
 *
 * WHY THE STEPS GO UP THROUGH DARK RATHER THAN TO GREY OR WHITE. A light panel
 * was the obvious reading of "different background so you know you have moved",
 * and it cannot work here: the signal colour measures 1.17:1 on white and
 * 2.42:1 on mid grey, so an inverted panel would silently kill the one colour
 * carrying risk and liveness through the whole product. Stepping up through
 * near-blacks keeps every panel legible — the lightest still runs 14.3:1 for
 * body text and 13.6:1 for the signal — while reading unmistakably as a new
 * surface against the void. */

/* Graded grounds, darkest first, then the inversion. Near-blacks stop
   registering as change after two or three steps, so the sequence climbs and
   then flips to a light panel before returning to the void. */
export const PANEL_TONES = [
  "bg-[#000000]",
  "bg-[#07080a]",
  "bg-[#0e1013]",
  "bg-[#161a1e]",
  "bg-[#1e2329]",
] as const

/* A pool of departures, not one repeated.
 *
 * Every panel receding identically is the same monotony the page already had
 * in its headline scale — the eye learns it once and stops reading it as
 * movement. Each variant is a different way of getting out of the way, and
 * they are assigned so no two consecutive panels leave alike.
 *
 * All of them are transform-only. Nothing here dims text: a brightness filter
 * measured 1.2:1 on a covered panel, and anyone who stops mid-transition reads
 * at whatever it is showing. */
export type PanelExit = "recede" | "tilt" | "drift" | "hold"

const EXITS: Record<PanelExit, gsap.TweenVars> = {
  // Straight back, away from the viewer.
  recede: { scale: 0.94 },
  // Tipping away at the top edge — the closest this gets to depth, and the
  // perspective is on the parent so the rotation reads as a plane, not a skew.
  tilt: { scale: 0.965, rotateX: 7, transformPerspective: 1400 },
  // Leaving upward as it shrinks, so it reads as travelling rather than
  // shrinking in place.
  drift: { scale: 0.97, yPercent: -6 },
  // Stillness. A beat where the incoming panel does all the work, so the
  // others land harder by contrast.
  hold: {},
}

export default function StackPanel({
  children,
  tone = 0,
  exit = "recede",
  light = false,
  className = "",
  id,
}: {
  children: ReactNode
  /** Index into PANEL_TONES. Rising through a page reads as ascending. */
  tone?: number
  /** How this panel gets out of the way when the next one arrives. */
  exit?: PanelExit
  /** Invert to the light ground. See .panel-light in index.css. */
  light?: boolean
  className?: string
  id?: string
}) {
  const ref = useRef<HTMLElement>(null)

  /* Keep the sticky offset matched to the panel's own height. Runs regardless
     of motion preference: reduced motion turns the panel back into ordinary
     flow in index.css, where `top` is inert, and this is a correctness fix
     rather than an effect. Re-measured on resize and whenever the content
     reflows, because the figures here load asynchronously and a panel is a
     different height once its data arrives. */
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const fit = () => {
      const over = el.offsetHeight - window.innerHeight
      el.style.top = over > 0 ? `${-over}px` : "0px"
    }
    fit()

    const ro = new ResizeObserver(fit)
    ro.observe(el)
    window.addEventListener("resize", fit)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", fit)
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const ctx = gsap.context(() => {
      /* Geometry only — no brightness filter.
       *
         Dimming the outgoing panel was the obvious depth cue and it fails:
         at brightness(0.45) the body text measures 1.2:1 while the panel is
         being covered, and anyone who stops mid-transition is reading at that.
         On the lighter panels *any* dim breaks 4.5:1, because they start at
         4.74:1. The recede is carried by scale and by the shadow the incoming
         panel casts, both of which cost nothing in contrast. */
      const vars = EXITS[exit]
      if (!Object.keys(vars).length) return // "hold" — the incoming panel carries it.

      gsap.fromTo(
        el,
        { scale: 1, rotateX: 0, yPercent: 0 },
        {
          ...vars,
          ease: "none",
          immediateRender: false,
          scrollTrigger: {
            trigger: el,
            // Begins only once the panel's own end is at the viewport floor —
            // i.e. exactly when the next panel starts covering it.
            start: "bottom bottom",
            end: "bottom top",
            scrub: 0.5,
          },
        }
      )
    }, el)

    return () => ctx.revert()
  }, [exit])

  return (
    <section
      ref={ref}
      id={id}
      className={`stack-panel ${
        light ? "panel-light" : PANEL_TONES[Math.min(tone, PANEL_TONES.length - 1)]
      } ${className}`}
    >
      {children}
    </section>
  )
}
