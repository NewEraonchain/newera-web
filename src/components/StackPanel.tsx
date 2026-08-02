import { useEffect, useRef, type ReactNode } from "react"

/* Sections that stack, so arriving at one is felt rather than inferred.
 *
 * Each panel sticks to the top of the viewport and the next one rides up over
 * it on its own opaque ground, casting a shadow as it comes. The shadow is the
 * depth cue and the hairline is the arriving surface's edge; the panel being
 * covered does nothing at all. See the note on departures below for what used
 * to happen there and why it had to stop.
 *
 * WHY STICKY AND NOT A ScrollTrigger PIN. Pinning wraps the element in a
 * pin-spacer and takes over its positioning, and this page already runs a pin
 * on the pipeline; stacking a second pinning system on top of it is the exact
 * combination the GSAP forums are full of. Sticky is native and costs nothing —
 * and now that nothing animates the covered panel, this file runs no GSAP at
 * all.
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

/* WHY THE PANELS NO LONGER TRANSFORM AS THEY LEAVE.
 *
 * There was a pool of departures here — recede (scale 0.94), tilt (scale plus
 * a 7deg rotateX on a 1400 perspective), drift (scale plus yPercent) — assigned
 * so no two consecutive panels left alike. The idea was a depth cue for an
 * overlap that is otherwise invisible, because both grounds are dark.
 *
 * The cue never arrived and its edges did. A 6% scale against an identical
 * near-black ground is not perceptible as depth; what *is* perceptible is
 * everything the shrink uncovers. Two ways, both visible:
 *
 *   - `.stack-panel::before` is the arriving surface's edge, and it is
 *     rgba(255,255,255,.15) — plainly visible on black. Scaled to 0.94 at
 *     1440px it stops 43px short of each side, so the page's one structural
 *     hairline hangs in space with a gap at both ends.
 *   - The light panel is the whole failure in one frame. Inverted against the
 *     void, the shrink opens a dark strip down each edge, and the panel behind
 *     shows through it — captured at 2x mid-recede you can read the previous
 *     section's axis labels beside the survival figures.
 *
 * Content appearing around the edges of a panel reads as the page failing to
 * draw, which is what it was reported as. The stack itself needs none of it:
 * sticky does the overlap, the shadow says which surface is in front, and the
 * hairline says where the new one starts. `exit` is kept on the props so the
 * call sites keep reading as a composition, and so turning a departure back on
 * for one panel stays a local decision. */
export type PanelExit = "recede" | "tilt" | "drift" | "hold"

export default function StackPanel({
  children,
  tone = 0,
  light = false,
  className = "",
  id,
}: {
  children: ReactNode
  /** Index into PANEL_TONES. Rising through a page reads as ascending. */
  tone?: number
  /** Accepted and ignored — see the note on departures above. */
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
