/* The headline, set on the width axis.
 *
 * Anybody carries wdth 50–150 as well as wght 100–900, and each line here
 * carries its own width and weight — so the block reads as a set typographic
 * composition rather than three lines at one size. That is the reason for the
 * face: no static family can set three widths from one file.
 *
 * Scroll velocity used to drive the width, compressing the lines as the page
 * moved and releasing them as it settled. It was removed for the reason set out
 * in `kinetic.tsx`: on the built page it reads as the headline stretching in and
 * out while you scroll. The composition below is what it always rested at. */
export default function KineticHeading({
  lines,
  className = "",
  as: Tag = "h1",
}: {
  lines: { text: string; width: number; weight: number }[]
  className?: string
  /* The closing statement uses this too, and a page may only have one h1. */
  as?: "h1" | "h2"
}) {
  return (
    <Tag className={`font-display uppercase ${className}`}>
      {lines.map((l) => (
        <span
          key={l.text}
          style={{ fontStretch: `${l.width}%`, fontWeight: l.weight }}
          className="block whitespace-nowrap"
        >
          {l.text}
        </span>
      ))}
    </Tag>
  )
}
