import { useEffect, useRef, type ElementType, type ReactNode } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

type Props = {
  children: ReactNode
  /** Stagger direct children instead of moving the wrapper as one block. */
  stagger?: boolean
  delay?: number
  as?: ElementType
  className?: string
}

/* Scroll reveal driven by ScrollTrigger, which SmoothScroll has already synced
   to Lenis — a plain IntersectionObserver fires against native scroll position
   and so triggers early while Lenis is still interpolating.
 *
 * once: true because a section that re-animates every time you scroll back past
 * it reads as a glitch, not as polish. */
export default function Reveal({
  children,
  stagger = false,
  delay = 0,
  as: Tag = "div",
  className,
}: Props) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const ctx = gsap.context(() => {
      const targets = stagger ? Array.from(el.children) : [el]
      gsap.from(targets, {
        y: 26,
        opacity: 0,
        duration: 0.85,
        ease: "power2.out",
        delay,
        stagger: stagger ? 0.09 : 0,
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      })
    }, el)

    return () => {
      ctx.revert()
    }
  }, [stagger, delay])

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  )
}
