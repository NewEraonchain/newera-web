import { useEffect, useRef } from "react"
import gsap from "gsap"
import { useStats } from "@/lib/useStats"

/* The instrument's own cursor.
 *
 * The aperture is what the index is looking at; this is the thing doing the
 * looking, and it carries the chain height as its readout — so the pointer is
 * never just a pointer, it is a live position in the chain.
 *
 * Only on fine pointers with motion allowed. Replacing the system cursor on a
 * touch device or for someone who has asked for less motion is a cost with no
 * benefit, so in those cases this renders nothing and the native cursor stays. */
export default function Reticle() {
  const ref = useRef<HTMLDivElement>(null)
  const readRef = useRef<HTMLSpanElement>(null)
  const stats = useStats()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fine = window.matchMedia("(pointer: fine)").matches
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    /* Forced colours would repaint the arms in the system Canvas colour and
       `mix-blend-difference` cancels them out entirely, so the replacement
       pointer is invisible while `cursor: none` hides the real one. Don't
       install at all — the CSS guard is the belt, this is the braces. */
    const forced = window.matchMedia("(forced-colors: active)").matches
    if (!fine || still || forced) return

    document.documentElement.classList.add("reticle-on")

    const xTo = gsap.quickTo(el, "x", { duration: 0.3, ease: "power3" })
    const yTo = gsap.quickTo(el, "y", { duration: 0.3, ease: "power3" })

    const onMove = (e: PointerEvent) => {
      xTo(e.clientX)
      yTo(e.clientY)
      if (el.style.opacity !== "1") el.style.opacity = "1"
    }
    // Leaving the window should retire it rather than parking it at the edge.
    const onLeave = () => {
      el.style.opacity = "0"
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    document.addEventListener("pointerleave", onLeave)

    return () => {
      document.documentElement.classList.remove("reticle-on")
      window.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerleave", onLeave)
    }
  }, [])

  useEffect(() => {
    if (readRef.current && stats?.indexedThroughBlock) {
      readRef.current.textContent = `BLOCK ${Number(stats.indexedThroughBlock).toLocaleString("en-US")}`
    }
  }, [stats])

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{ opacity: 0 }}
      /* Above everything, without exception.
       *
       * This replaces the system cursor — `.reticle-on * { cursor: none }` —
       * so anything that paints over it does not hide a decoration, it hides
       * the pointer. At z-[100] it sat underneath the onboarding dialog's
       * overlay (also z-[100], and later in the DOM) and its panel (z-[101]),
       * so opening the dialog left no visible pointer at all: no reticle,
       * because it was covered, and no arrow, because we had turned it off.
       * The one element standing in for the mouse has to outrank every layer
       * that will ever be added. */
      className="pointer-events-none fixed left-0 top-0 z-[9999] mix-blend-difference"
    >
      <span className="absolute -left-3 top-0 block h-px w-6 bg-white" />
      <span className="absolute left-0 -top-3 block h-6 w-px bg-white" />
      <span
        ref={readRef}
        className="absolute left-5 top-2 whitespace-nowrap font-mono text-[10px] tracking-[0.06em] text-white"
      />
    </div>
  )
}
