import { useEffect, useRef } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

/* The detector, doing its job in front of you.
 *
 * A scan runs left to right across the ticker and marks every character that
 * is not what it appears to be. The offending characters are found at render
 * time by code point, not hardcoded by index — the same test the backend makes,
 * so the marks cannot drift out of step with the string.
 *
 * The default state is deliberately the *unannotated* one: with no JavaScript,
 * or before the scan reaches it, the spoof sits there looking exactly like the
 * token it imitates, which is precisely the situation this section is about.
 * Motion adds the finding rather than removing a mask, so nothing is ever
 * hidden and there is no state to fail into. */

const isSuspect = (ch: string) => {
  const cp = ch.codePointAt(0) ?? 0
  // Anything outside printable ASCII in a ticker is either a lookalike from
  // another alphabet or an invisible joiner. Both are the attack.
  return cp > 0x7e || cp < 0x20
}

const isZeroWidth = (ch: string) => {
  const cp = ch.codePointAt(0) ?? 0
  return cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0x2060 || cp === 0xfeff
}

export default function SpoofScan({
  shown,
  real,
  note,
  flag,
}: {
  shown: string
  real: string
  note: string
  flag: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const chars = Array.from(real)

  useEffect(() => {
    const el = root.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // No scan, but the finding still has to be legible — mark it outright.
      el.querySelectorAll("[data-suspect]").forEach((n) => n.classList.add("text-danger"))
      el.querySelectorAll<HTMLElement>("[data-caret]").forEach((n) => (n.style.opacity = "1"))
      return
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: "top 80%", once: true },
      })

      // The scan head crosses the string once.
      tl.fromTo(
        "[data-scan]",
        { scaleX: 0, transformOrigin: "left center", opacity: 1 },
        { scaleX: 1, duration: 0.9, ease: "power1.inOut" }
      )
        // Each finding lands as the head passes it, then the head retires.
        .to("[data-suspect]", { color: "#ff8a97", duration: 0.2, stagger: 0.16 }, "<0.15")
        .to("[data-caret]", { opacity: 1, y: 0, duration: 0.25, stagger: 0.16 }, "<")
        .to("[data-scan]", { opacity: 0, duration: 0.35 }, ">-0.1")
        .to("[data-flag]", { opacity: 1, x: 0, duration: 0.35, ease: "expo.out" }, "<")
    }, el)

    return () => {
      ctx.revert()
    }
  }, [real])

  return (
    <div
      ref={root}
      className="grid gap-x-10 gap-y-5 border-b border-edge py-9 sm:grid-cols-[auto_1fr]"
    >
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3">
        <span className="font-mono text-2xl font-semibold text-fg">{shown}</span>
        <span className="text-sm text-fg-dim">vs</span>

        <span className="relative inline-block font-mono text-2xl font-semibold text-fg">
          {chars.map((ch, i) => (
            <span key={i} className="relative inline-block" data-suspect={isSuspect(ch) || undefined}>
              {/* A zero-width character has no box to colour, so it gets a
                  visible stand-in — otherwise the one finding that matters most
                  is the one you cannot see. */}
              {isZeroWidth(ch) ? (
                <span aria-hidden className="inline-block w-[0.28em] text-center opacity-70">
                  ·
                </span>
              ) : (
                ch
              )}
              {isSuspect(ch) && (
                <span
                  aria-hidden
                  data-caret
                  style={{ opacity: 0, transform: "translateY(-3px)" }}
                  className="absolute -bottom-2 left-0 h-px w-full bg-danger"
                />
              )}
            </span>
          ))}
          <span
            aria-hidden
            data-scan
            style={{ opacity: 0 }}
            className="pointer-events-none absolute inset-y-0 left-0 w-full bg-gradient-to-r from-transparent via-acid-500/25 to-acid-500/50"
          />
        </span>
      </div>

      <div className="sm:text-right">
        <span
          data-flag
          style={{ opacity: 0, transform: "translateX(8px)" }}
          className="inline-block font-mono text-micro font-semibold text-danger"
        >
          {flag}
        </span>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">{note}</p>
      </div>
    </div>
  )
}
