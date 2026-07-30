import { ReactLenis, useLenis } from "lenis/react"
import { useEffect, type ReactNode } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

/* Lenis and ScrollTrigger both want to own the scroll loop. Left alone they
   fight: ScrollTrigger reads native scrollTop while Lenis is mid-interpolation,
   so pinned sections judder and reveals fire at the wrong offset.
 *
 * The fix is to give GSAP the clock and Lenis the position — one raf driver
 * (gsap.ticker), and ScrollTrigger.update called from Lenis's own scroll event
 * rather than the browser's. lagSmoothing(0) stops GSAP from silently skipping
 * frames after a stall, which otherwise desynchronises the two. */
function Sync() {
  const lenis = useLenis()

  useEffect(() => {
    if (!lenis) return
    const update = () => ScrollTrigger.update()
    lenis.on("scroll", update)

    // Lenis measures in ms, gsap.ticker reports seconds.
    const raf = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)

    return () => {
      lenis.off("scroll", update)
      gsap.ticker.remove(raf)
      gsap.ticker.lagSmoothing(500, 33)
    }
  }, [lenis])

  return null
}

export default function SmoothScroll({ children }: { children: ReactNode }) {
  // Smooth scroll hijacks a control the user may have deliberately tuned —
  // honour the OS setting and hand scrolling straight back to the browser.
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches

  if (reduced) return <>{children}</>

  return (
    <ReactLenis
      root
      options={{
        // gsap.ticker drives the loop instead, so Lenis must not run its own.
        autoRaf: false,
        lerp: 0.09,
        wheelMultiplier: 1,
        // Anchor links and nested scrollers (the live tape) must keep working.
        anchors: true,
        allowNestedScroll: true,
      }}
    >
      <Sync />
      {children}
    </ReactLenis>
  )
}
