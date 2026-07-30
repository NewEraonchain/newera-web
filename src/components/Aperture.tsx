import { useEffect, useRef, type ElementType, type ReactNode } from "react"

/* The aperture: a band of legibility that tracks the pointer.
 *
 * One engine drives every plate on the page from a single rAF loop and a single
 * pointermove listener. Per-plate listeners would mean N getBoundingClientRect
 * calls per event and a layout thrash on a page that also runs ScrollTrigger.
 *
 * Implemented as one text node with a scrim above and below the band, rather
 * than two stacked copies of the text. The first version rendered its children
 * twice — which meant duplicated DOM, an aria-hidden copy, a render prop so
 * headings could avoid emitting two <h1> tags, and genuinely occluded text.
 * A scrim gets the identical result with the real text left alone at full
 * contrast, which is better for a screen reader, for selection, and for anyone
 * whose CSS fails to load.
 *
 * The rules this implements live in index.css next to .plate, because they are
 * accessibility constraints rather than styling: the accessible default is a
 * fully resolved page, and the aperture is an enhancement layered over it. */

const plates = new Set<HTMLElement>()
let pointerY = -1
let apertureHeight = 18 // % of a plate's height; grows as the page is read
let running = false
let active = false

function frame() {
  if (!active || pointerY < 0) {
    running = false
    return
  }
  const vh = window.innerHeight
  for (const el of plates) {
    const r = el.getBoundingClientRect()
    // Skip anything comfortably off-screen; the loop runs every frame.
    if (r.bottom < -240 || r.top > vh + 240 || r.height === 0) continue
    const rel = ((pointerY - r.top) / r.height) * 100
    const top = Math.max(0, Math.min(100 - apertureHeight, rel - apertureHeight / 2))
    el.style.setProperty("--ap-top", `${top}%`)
    el.style.setProperty("--ap-bot", `${100 - top - apertureHeight}%`)
  }
  running = false
}

function schedule() {
  if (running) return
  running = true
  requestAnimationFrame(frame)
}

/* Installed once, at the app root. */
export function useApertureEngine() {
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (!fine || still) return

    active = true

    const onMove = (e: PointerEvent) => {
      pointerY = e.clientY
      // Nothing dims until the pointer has actually moved, so the page's
      // resting state is fully legible rather than fully masked.
      document.documentElement.classList.add("aperture-on")
      schedule()
    }
    // The further the page is read, the more the index has resolved: by the
    // end everything is lit. Without this the aperture reads as a gimmick that
    // never pays off.
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 1
      apertureHeight = 18 + p * 78
      schedule()
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()

    return () => {
      active = false
      document.documentElement.classList.remove("aperture-on")
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("scroll", onScroll)
    }
  }, [])
}

type PlateProps = {
  children: ReactNode
  className?: string
  as?: ElementType
  /** Draw the band's hairline edges. Off for dense lists, where two extra
      rules per plate is noise rather than instrument. */
  rules?: boolean
}

export default function Plate({
  children,
  className = "",
  as: Tag = "div",
  rules = false,
}: PlateProps) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    plates.add(el)
    return () => {
      plates.delete(el)
    }
  }, [])

  return (
    <Tag ref={ref} className={`plate ${className}`}>
      {children}
      <span aria-hidden className="ap-scrim ap-scrim-top" />
      <span aria-hidden className="ap-scrim ap-scrim-bot" />
      {rules && (
        <>
          <span aria-hidden className="aperture-rule" style={{ top: "var(--ap-top, 0%)" }} />
          <span
            aria-hidden
            className="aperture-rule"
            style={{ top: "calc(100% - var(--ap-bot, 0%))" }}
          />
        </>
      )}
    </Tag>
  )
}
