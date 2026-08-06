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

// Eight seconds: Robinhood Chain makes ten blocks a second, so the block height
// visibly moves between polls without hammering the API.
const EVERY_MS = 8000

/* Nothing polls a tab nobody is looking at.
 *
 * This ran every eight seconds for as long as the page existed, which on a tab
 * left open overnight is ten thousand requests to render a number behind
 * another window. The block height is also stale the instant the tab is hidden,
 * so the poll was buying nothing even in principle. Coming back reads
 * immediately rather than waiting out the interval — a stale height on the tab
 * you just switched to is the one moment it is actually being read. */
function start() {
  if (timer || document.hidden) return
  poll()
  timer = setInterval(poll, EVERY_MS)
}

function stop() {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

function onVisibility() {
  if (document.hidden) stop()
  else if (subscribers.size) start()
}

export function useStats(): Stats | null {
  const [stats, setStats] = useState<Stats | null>(current)

  useEffect(() => {
    subscribers.add(setStats)
    if (current) setStats(current)
    start()
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      subscribers.delete(setStats)
      if (subscribers.size === 0) {
        stop()
        document.removeEventListener("visibilitychange", onVisibility)
      }
    }
  }, [])

  return stats
}
