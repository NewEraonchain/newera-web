import type { ReactNode } from "react"

/* The page shell.
 *
 * Every route used to declare its own `mx-auto max-w-[Nrem]`, and they had
 * drifted to three different values — 54, 72 and 78rem — none of them chosen
 * against the content they hold. Measured at 1920, the token page ran its
 * chart, its tape and its trade panel down a 1152px column with 384px of dead
 * black on each side, and the feed's market figures sat in a row so wide that
 * nothing aligned between one launch and the next.
 *
 * Width is a function of what the content is, not of the page it is on:
 *
 *   `prose`  — bound by the reading measure. A line of text wider than ~75ch is
 *              harder to read, not more generous. It is bound on the RIGHT and
 *              left-aligned to the gutter, not centred: every other reading
 *              surface on the site — /about, /docs, the legal pages — starts at
 *              the gutter, so a centred column was one page floating on its own
 *              axis while the nav above it stayed put.
 *   `app`    — bound by the widest useful table. Operate surfaces carry columns
 *              that want to align, and squeezing them into a reading measure is
 *              what made the feed read as an undifferentiated list.
 *
 * The `app` width is deliberately not full-bleed. This world is spacious and
 * point-black; edge-to-edge data would read as a terminal emulator, which is
 * the exact thing the feed was already being criticised for.
 */

/* Width and the top entrance travel together. A Read surface earns the drop —
   it is a page you settle into. An Operate surface is a tool, and 13vh of empty
   plate above the masthead is one more row of the tape you cannot see. */
const WIDTHS = {
  prose: "max-w-[62rem] pt-[13vh]",
  app: "max-w-[var(--shell-max)] pt-[8vh]",
  narrow: "max-w-[46rem] pt-[13vh]",
} as const

export function Page({
  width = "app",
  className = "",
  children,
}: {
  width?: keyof typeof WIDTHS
  className?: string
  children: ReactNode
}) {
  /* The horizontal inset is `--gutter`, applied to a full-bleed box, rather
     than a centred max-width with its own padding. The two produce an identical
     left edge — that is how `--gutter` is defined — but this way the number is
     shared with the nav, the footer and the landing instead of re-derived here,
     so the whole site starts on one line. */
  return (
    <div className={`w-full px-[var(--gutter)] pb-[14vh] ${className}`}>
      <div className={`w-full ${WIDTHS[width]}`}>{children}</div>
    </div>
  )
}

/* A section heading and its running count on one rule.
 *
 * Shared so the count always sits on the same baseline as the title and never
 * drifts to a second line at an intermediate width. */
export function SectionHead({
  title,
  note,
  as: Tag = "h2",
}: {
  title: string
  note?: string
  as?: "h2" | "h3"
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-edge pb-3">
      <Tag className="text-[clamp(1.15rem,1.6vw,1.4rem)] font-semibold text-fg">{title}</Tag>
      {note && (
        <span className="font-mono text-micro uppercase tracking-[0.12em] text-fg-dim">{note}</span>
      )}
    </div>
  )
}
