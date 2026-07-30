import { useEffect, useRef, useState } from "react"
import { getJSON, type Stats } from "@/lib/api"

/* The indexed block height, polled and ticking.
 *
 * The number is never incremented locally. Robinhood Chain produces ten blocks
 * a second and the watcher was measured moving four hundred in twelve, so the
 * figure advances on its own between polls — a client-side counter would look
 * identical and be a fabrication, on a page whose entire argument is that the
 * data is honest.
 *
 * Digits that changed flash and settle; digits that did not stay still. That is
 * the aliveness: you can see exactly how much of the chain arrived while you
 * were looking at it. */
export default function ChainTicker({ className = "" }: { className?: string }) {
  const [block, setBlock] = useState<string | null>(null)
  const prev = useRef<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = () =>
      getJSON<Stats>("/intel/stats")
        .then((s) => {
          if (!alive || !s.indexedThroughBlock) return
          setBlock((b) => {
            prev.current = b
            return s.indexedThroughBlock
          })
        })
        .catch(() => {})
    load()
    const t = setInterval(load, 8000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  if (!block) return null

  const shown = Number(block).toLocaleString("en-US")
  const before = prev.current ? Number(prev.current).toLocaleString("en-US") : null

  return (
    <p className={`flex items-baseline gap-2 font-mono text-xs text-fg-dim ${className}`}>
      <span className="relative flex h-1.5 w-1.5 self-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-acid-500 opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-acid-500" />
      </span>
      <span className="tabular-nums text-fg">
        {shown.split("").map((ch, i) => {
          // Compare from the right so a digit keeps its identity as the number
          // grows and the string lengthens.
          const fromRight = shown.length - i
          const b = before ? before[before.length - fromRight] : undefined
          const changed = before != null && b !== ch
          return (
            <span
              key={`${i}-${ch}-${changed}`}
              className={changed ? "inline-block animate-[digit-tick_900ms_ease-out]" : undefined}
            >
              {ch}
            </span>
          )
        })}
      </span>
      <span>blocks indexed</span>
    </p>
  )
}
