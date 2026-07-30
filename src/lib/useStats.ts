import { useEffect, useState } from "react"
import { getJSON, type Stats } from "./api"

/* One poller for the whole page.
 *
 * The hero, the pipeline, the evidence table, the block ticker and the reticle
 * all want /intel/stats. Before this they each ran their own interval, which
 * meant five requests where one would do and five different values of the same
 * number on screen at once — on a page whose argument is that the figures are
 * measured. A single source keeps them in step. */

let current: Stats | null = null
let timer: ReturnType<typeof setInterval> | null = null
const subscribers = new Set<(s: Stats) => void>()

async function poll() {
  try {
    const s = await getJSON<Stats>("/intel/stats")
    current = s
    for (const fn of subscribers) fn(s)
  } catch (err) {
    // Silent failure is how the onboarding funnel stayed broken for hours.
    console.error("[stats] unavailable:", err)
  }
}

export function useStats(): Stats | null {
  const [stats, setStats] = useState<Stats | null>(current)

  useEffect(() => {
    subscribers.add(setStats)
    if (current) setStats(current)

    if (!timer) {
      poll()
      // Eight seconds: Robinhood Chain makes ten blocks a second, so the block
      // height visibly moves between polls without hammering the API.
      timer = setInterval(poll, 8000)
    }

    return () => {
      subscribers.delete(setStats)
      if (subscribers.size === 0 && timer) {
        clearInterval(timer)
        timer = null
      }
    }
  }, [])

  return stats
}
