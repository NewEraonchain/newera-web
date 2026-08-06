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

    /* Nothing ticks for a tab nobody is looking at.
     *
     * gsap.ticker stays awake for as long as a listener is attached, and this
     * attaches one for the life of the app — so the ticker and GSAP's internal
     * _rafBugFix loop ran at the display's refresh rate forever, measured at
     * 292 frame callbacks a second with the page completely idle. A hidden tab
     * cannot be scrolled, so there is nothing for either to do.
     *
     * The ticker is only slept, never stopped while visible: Lenis interpolates
     * towards a target every frame and a wheel event has to be answered on the
     * next one. Waking on `visibilitychange` is early enough — the browser
     * fires it before the tab can be interacted with. */
    const onVisibility = () => {
      if (document.hidden) gsap.ticker.sleep()
      else gsap.ticker.wake()
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      gsap.ticker.wake()
      lenis.off("scroll", update)
      gsap.ticker.remove(raf)
      gsap.ticker.lagSmoothing(500, 33)
    }
  }, [lenis])

  /* Re-measure when the page's own height settles.
   *
   * Every ScrollTrigger start and end is a number measured once, and this page
   * is not that page: the stats, the clusters and the separation figures all
   * arrive after mount and each one changes a panel's height. GSAP refreshes on
   * resize and on load, neither of which is a fetch resolving — so the pinned
   * pipeline held a start computed against a shorter document and engaged
   * roughly 2300px early, covering the viewport while the section before it was
   * still being read. Scrolling down went pipeline → previous panel → pipeline.
   *
   * It was invisible for as long as the pin was being torn down and rebuilt on
   * every eight-second stats poll, because each rebuild silently re-measured.
   * That is a re-measure with a page teardown attached, not a fix.
   *
   * The height is re-read after refreshing so a pin-spacer resizing during the
   * refresh cannot feed back into another one. */
  useEffect(() => {
    let height = document.documentElement.scrollHeight
    let t: number | undefined
    let lastScroll = 0

    const onScroll = () => {
      lastScroll = performance.now()
    }
    window.addEventListener("scroll", onScroll, { passive: true })

    /* A refresh recalculates every trigger on the page, which is the one thing
       that must not happen under a moving scroll — measured mid-gesture it cost
       a 1270ms frame and put the layout shifts back. So it waits for the reader
       to stop, and keeps waiting for as long as they do not. */
    const run = () => {
      if (performance.now() - lastScroll < 400) {
        t = window.setTimeout(run, 200)
        return
      }
      ScrollTrigger.refresh()
      height = document.documentElement.scrollHeight
    }

    const settle = () => {
      if (document.documentElement.scrollHeight === height) return
      window.clearTimeout(t)
      t = window.setTimeout(run, 180)
    }

    const ro = new ResizeObserver(settle)
    ro.observe(document.body)
    document.fonts?.ready.then(settle)

    return () => {
      window.removeEventListener("scroll", onScroll)
      ro.disconnect()
      window.clearTimeout(t)
    }
  }, [])

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
