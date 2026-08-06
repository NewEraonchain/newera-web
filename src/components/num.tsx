/* A formatted number, and nothing else.
 *
 * This lived in `kinetic.tsx` next to the GSAP text effects, which is where it
 * started life as an animated counter. It has no animation left — the count-up
 * was removed because a figure counting from zero displays a wrong number for
 * as long as it runs, under a heading that says "measured, not projected".
 *
 * What remained was a `<span>` with `toLocaleString`, still exported from a
 * module whose first four lines import gsap, ScrollTrigger, SplitText and
 * ScrambleTextPlugin. The site header renders one of these for the block
 * height, so every route on the site — /account, /terms, the feed — downloaded
 * 131kB of text-animation plugins to format an integer. Measured: 630kB of JS
 * on every route, 131kB of it this.
 */
export function RollingNumber({
  value,
  className = "",
}: {
  value: number | string
  className?: string
}) {
  const text = typeof value === "number" ? value.toLocaleString("en-US") : value
  return <span className={`tabular-nums ${className}`}>{text}</span>
}
