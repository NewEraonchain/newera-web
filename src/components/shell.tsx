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
 *   `prose`  — bound by the reading measure. Centring is correct here; a line
 *              of text wider than ~75ch is harder to read, not more generous.
 *   `app`    — bound by the widest useful table. Operate surfaces carry columns
 *              that want to align, and squeezing them into a reading measure is
 *              what made the feed read as an undifferentiated list.
 *
 * The `app` width is deliberately not full-bleed. This world is spacious and
 * point-black; edge-to-edge data would read as a terminal emulator, which is
 * the exact thing the feed was already being criticised for.
 */

const WIDTHS = {
  prose: "max-w-[62rem]",
  app: "max-w-[104rem]",
  narrow: "max-w-[46rem]",
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
  return (
    <div className={`mx-auto w-full ${WIDTHS[width]} px-[max(1.25rem,4vw)] pb-[14vh] pt-[13vh] ${className}`}>
      {children}
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
