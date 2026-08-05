import { useEffect, useRef } from "react"
import gsap from "gsap"

/* The instrument's own cursor.
 *
 * The aperture is what the index is looking at; this is the thing doing the
 * looking. It used to carry the chain height as a readout beside the crosshair,
 * which read well in principle and overprinted the page in practice — see the
 * note on the crosshair below. The height lives in the header instead, where it
 * has a background and does not follow the reader's eye.
 *
 * Only on fine pointers with motion allowed. Replacing the system cursor on a
 * touch device or for someone who has asked for less motion is a cost with no
 * benefit, so in those cases this renders nothing and the native cursor stays. */
export default function Reticle() {
  const ref = useRef<HTMLDivElement>(null)

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
      {/* Crosshair only.
          There was a "BLOCK 28,730,018" readout pinned 20px right and 8px below
          the pointer — always on, no dwell delay, no collision avoidance, inside
          a mix-blend-difference wrapper. Difference-blending white on white
          renders black, so it destroyed BOTH itself and whatever text sat under
          it, at the exact point the reader was looking. Captured overprinting
          the custody sentence on /app, a liquidity figure on a cluster page, and
          the DexScreener attribution on a token page. It was also 10px, below
          the project's own 11px floor for functional text.
          The block height already lives in the header and ticks there; the
          crosshair is the pointer, and the pointer does not need a caption. */}
      <span className="absolute -left-3 top-0 block h-px w-6 bg-white" />
      <span className="absolute left-0 -top-3 block h-6 w-px bg-white" />
    </div>
  )
}
