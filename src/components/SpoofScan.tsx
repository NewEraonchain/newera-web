import { useEffect, useRef } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

/* The detector, doing its job at the scale the proof deserves.
 *
 * This was set at ~28px in a two-row list beside 900px of empty canvas — the
 * product's most visceral evidence, five times smaller than the hero that
 * merely claims things. Two strings your eye cannot separate only works if
 * your eye is actually given the chance to fail, and it cannot fail at 28px in
 * a footnote.
 *
 * So: stacked, at plate scale, one above the other, so the reader compares them
 * the way a document examiner would. Then the scan crosses the second string
 * and marks every character that is not what it appears to be — found by code
 * point at render time, the same test the backend makes, so the marks cannot
 * drift out of step with the string. Each finding names its own code point,
 * because "these differ" is an assertion and "U+041E CYRILLIC CAPITAL O where
 * you read a Latin O" is evidence.
 *
 * The default state is deliberately the unannotated one: with no JavaScript, or
 * before the scan reaches it, the spoof sits there looking exactly like the
 * token it imitates — which is precisely the situation this section is about.
 * Motion adds the finding rather than removing a mask. */

const isSuspect = (ch: string) => {
  const cp = ch.codePointAt(0) ?? 0
  return cp > 0x7e || cp < 0x20
}

const isZeroWidth = (ch: string) => {
  const cp = ch.codePointAt(0) ?? 0
  return cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0x2060 || cp === 0xfeff
}

/* Names for the characters this product actually meets. Anything else falls
   back to its code point, which is still evidence — just less readable. */
const NAMES: Record<number, string> = {
  0x0410: "CYRILLIC A",
  0x0415: "CYRILLIC E",
  0x041e: "CYRILLIC O",
  0x0420: "CYRILLIC R",
  0x0421: "CYRILLIC S",
  0x0425: "CYRILLIC H",
  0x2060: "WORD JOINER",
  0x200b: "ZERO WIDTH SPACE",
  0x200d: "ZERO WIDTH JOINER",
}

const label = (ch: string) => {
  const cp = ch.codePointAt(0) ?? 0
  const hex = `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`
  return NAMES[cp] ? `${hex} ${NAMES[cp]}` : hex
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
  const suspects = chars.filter(isSuspect)

  useEffect(() => {
    const el = root.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // No scan, but the finding still has to be legible — mark it outright.
      el.querySelectorAll("[data-suspect]").forEach((n) => n.classList.add("text-danger"))
      el.querySelectorAll<HTMLElement>("[data-caret], [data-cp]").forEach(
        (n) => (n.style.opacity = "1")
      )
      return
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: "top 72%", once: true },
      })

      tl.fromTo(
        "[data-scan]",
        { scaleX: 0, transformOrigin: "left center", opacity: 1 },
        { scaleX: 1, duration: 1.1, ease: "power1.inOut" }
      )
        .to("[data-suspect]", { color: "#ff6b7a", duration: 0.22, stagger: 0.2 }, "<0.18")
        .to("[data-caret]", { opacity: 1, scaleY: 1, duration: 0.28, stagger: 0.2 }, "<")
        .to("[data-cp]", { opacity: 1, y: 0, duration: 0.32, stagger: 0.2 }, "<0.06")
        .to("[data-scan]", { opacity: 0, duration: 0.4 }, ">-0.15")
        .to("[data-flag]", { opacity: 1, x: 0, duration: 0.4, ease: "expo.out" }, "<")
    }, el)

    return () => ctx.revert()
  }, [real])

  return (
    <div ref={root} className="border-b border-edge py-[7vh]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
        <span className="font-mono text-xs text-fg-dim">the ticker you know</span>
        <span
          data-flag
          style={{ opacity: 0, transform: "translateX(10px)" }}
          className="inline-block font-mono text-xs font-semibold text-danger"
        >
          {flag} · {suspects.length} character{suspects.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Stacked, at plate scale. The comparison only works if the eye is given
          a real chance to fail at it. */}
      <div className="mt-3 font-mono text-[clamp(2.4rem,10vw,8.5rem)] font-semibold leading-[1.06] tracking-[-0.03em]">
        <div className="text-fg-dim">{shown}</div>

        <div className="relative mt-1 inline-block text-fg">
          {chars.map((ch, i) => (
            <span key={i} className="relative inline-block" data-suspect={isSuspect(ch) || undefined}>
              {/* A zero-width character has no box to colour, so it gets a
                  visible stand-in — otherwise the one finding that matters most
                  is the one you cannot see. */}
              {isZeroWidth(ch) ? (
                <span aria-hidden className="inline-block w-[0.3em] text-center opacity-70">
                  ·
                </span>
              ) : (
                ch
              )}

              {isSuspect(ch) && (
                <>
                  <span
                    aria-hidden
                    data-caret
                    style={{ opacity: 0, transform: "scaleY(0)", transformOrigin: "top" }}
                    className="absolute -bottom-3 left-0 h-3 w-full border-t border-danger"
                  />
                  <span
                    aria-hidden
                    data-cp
                    style={{ opacity: 0, transform: "translateY(-4px)" }}
                    className="absolute -bottom-9 left-0 whitespace-nowrap font-mono text-[10px] font-normal tracking-[0.06em] text-danger sm:text-[11px]"
                  >
                    {label(ch)}
                  </span>
                </>
              )}
            </span>
          ))}

          <span
            aria-hidden
            data-scan
            style={{ opacity: 0 }}
            className="pointer-events-none absolute inset-y-0 left-0 w-full bg-gradient-to-r from-transparent via-acid-500/20 to-acid-500/45"
          />
        </div>
      </div>

      <p className="measure mt-16 text-sm leading-relaxed text-fg-muted">{note}</p>
    </div>
  )
}
