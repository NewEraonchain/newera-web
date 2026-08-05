import { Link } from "react-router-dom"
import { Rise, Wipe, Stagger, RuleDraw } from "@/components/scroll"
import { KineticText, ResolveText } from "@/components/kinetic"

/* Shared layout for every long-form page: features, docs, about, legal.
   One place to change type rhythm rather than nine.
 *
 * Read mode, in the Aperture world. Comprehension and wayfinding come first —
 * no aperture over prose, no display type where a reader has to stay for
 * paragraphs — but the furniture is the same: full bleed to a 4vw margin,
 * a mono rail carrying the page's own reference, and rules instead of cards. */

export function Article({
  kicker,
  title,
  standfirst,
  children,
}: {
  kicker: string
  title: string
  standfirst?: string
  children: React.ReactNode
}) {
  return (
    <div className="px-[var(--gutter)] pb-[16vh] pt-[14vh]">
      <div className="grid gap-x-12 gap-y-8 md:grid-cols-[10rem_1fr]">
        {/* The kicker was a tracked uppercase label stacked directly above the
            heading, which is banned outright — the heading carries its own
            weight. The same words work as a reference in the rail beside it,
            where they read as a document slug rather than a label. */}
        <Wipe as="p" className="font-mono text-micro uppercase tracking-[0.14em] text-fg-dim md:pt-3">
          <ResolveText>{kicker}</ResolveText>
        </Wipe>

        <Rise>
          <KineticText as="h1" className="font-display max-w-[16ch] text-[clamp(2.2rem,6vw,4.8rem)] font-extrabold uppercase leading-[0.9] tracking-[-0.03em]" base={72} amount={0.3}>{title}</KineticText>
          {standfirst && (
            <p className="measure mt-8 text-lg leading-relaxed text-fg-muted">{standfirst}</p>
          )}
        </Rise>
      </div>

      <div className="mt-[10vh] flex flex-col gap-[7vh]">{children}</div>
    </div>
  )
}

export function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="relative grid gap-x-12 gap-y-5 pt-8 md:grid-cols-[10rem_1fr]">
      <RuleDraw className="absolute inset-x-0 top-0" />
      {/* The rail slug holds its place while the prose beside it scrolls, so a
          long section always says what it is. */}
      <h2 className="font-mono text-micro uppercase tracking-[0.14em] text-fg-dim md:sticky md:top-[16vh] md:self-start">
        {title}
      </h2>
      {/* The measure caps paragraphs, not the container. Putting it on the
          container squeezed every Step, Terms table and grid nested inside a
          Section to 54ch and collapsed their columns to ~119px. */}
      <Rise className="flex flex-col gap-4 text-base leading-[1.75] text-fg-muted [&>p]:max-w-[54ch] [&_b]:text-fg [&_strong]:text-fg [&_em]:text-fg">
        {children}
      </Rise>
    </section>
  )
}

/** A pipeline stage: a plain explanation, and what runs underneath it.
 *  Unnumbered — the headings and their order already carry the sequence, so
 *  digits beside them are editorial scaffolding rather than structure. */
export function Step({
  title,
  plain,
  runs,
}: {
  title: string
  plain: string
  runs: React.ReactNode
}) {
  return (
    /* Was a card containing a second card. Rules and columns carry the same
       hierarchy without stacking two containers.
     *
       Three columns on wide screens rather than one narrow one: the plain
       explanation and the detail sit side by side, which uses the page instead
       of leaving half of it empty beside a 54ch column. They stack below lg. */
    <div className="relative grid gap-x-12 gap-y-6 pt-8 md:grid-cols-[10rem_1fr] lg:grid-cols-[10rem_minmax(0,30rem)_minmax(0,26rem)]">
      <RuleDraw className="absolute inset-x-0 top-0" />
      <div aria-hidden />
      <Rise>
        <h3 className="text-xl font-semibold text-fg">{title}</h3>
        <p className="mt-3 text-base leading-relaxed text-fg-muted">{plain}</p>
      </Rise>
      <Rise
        delay={0.1}
        className="border-l border-edge-strong pl-5 lg:col-start-3 lg:row-start-1"
      >
        <span className="mb-2 block font-mono text-micro uppercase tracking-[0.14em] text-fg-dim">
          Underneath
        </span>
        <p className="text-sm leading-relaxed text-fg-dim">{runs}</p>
      </Rise>
    </div>
  )
}

export function Callout({
  tone = "info",
  label,
  children,
}: {
  tone?: "info" | "warn" | "danger"
  label?: string
  children: React.ReactNode
}) {
  /* A 1px rule in the tone's colour rather than a filled, rounded, tinted box.
     Colour still carries the signal; it just stops building another container. */
  const rule = {
    info: "border-acid-500/60",
    warn: "border-warn/60",
    danger: "border-danger/60",
  }[tone]
  const labelTone = {
    info: "text-acid-500",
    warn: "text-warn",
    danger: "text-danger",
  }[tone]
  return (
    <div className={`measure border-l pl-5 text-sm leading-relaxed text-fg-muted ${rule}`}>
      {label && (
        /* Not uppercased. Callers pass whole sentences here ("Observed live,
           four launches two seconds apart"), and forcing caps on a sentence
           makes it a shout rather than a label. */
        <span className={`mb-2 block font-mono text-xs tracking-[0.04em] ${labelTone}`}>
          {label}
        </span>
      )}
      {children}
    </div>
  )
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <Stagger as="ul" className="flex flex-col gap-3" each={0.05}>
      {items.map((it, i) => (
        <li key={i} className="flex gap-4 text-base leading-relaxed text-fg-muted">
          {/* A hairline, matching the pipeline's markers — the same mark used
              everywhere for "an item in a list" rather than a lime dot. */}
          <span aria-hidden className="mt-[13px] h-px w-3 flex-none bg-edge-strong" />
          <span className="max-w-[54ch] [&_b]:text-fg [&_strong]:text-fg">{it}</span>
        </li>
      ))}
    </Stagger>
  )
}

export function Mono({ children }: { children: React.ReactNode }) {
  return (
    /* `break-words`: these hold endpoint URLs, and a URL has no break
       opportunity a browser will take on its own. One of them — the curl
       example on /docs — measured 313px inside a 280px column and pushed the
       whole page 17px sideways at 320px, which is a 1280 window at 400% zoom.
       WCAG 1.4.10 is about that window, not about phones.

       `anywhere`, not `break-word`. Both break the line, but only `anywhere`
       lowers the element's min-content width — with `break-word` the column
       still reserves the full unbroken URL and the page still scrolls. */
    <code className="border-b border-edge-strong px-0.5 font-mono text-sm text-fg [overflow-wrap:anywhere]">
      {children}
    </code>
  )
}

/** Small definition grid — used for glossaries and score bands. */
export function Terms({ items }: { items: { term: string; body: string }[] }) {
  return (
    <Stagger as="dl" className="border-t border-edge">
      {items.map((t) => (
        <div
          key={t.term}
          className="grid gap-x-8 gap-y-1 border-b border-edge py-4 sm:grid-cols-[12rem_1fr]"
        >
          {/* Not uppercased. These are terms, not labels — they carry words a
              reader has to read, and forcing caps on running content slows it
              down and strips the shapes the eye recognises. */}
          <dt className="font-mono text-xs tracking-[0.04em] text-fg">{t.term}</dt>
          <dd className="measure text-sm leading-relaxed text-fg-dim">{t.body}</dd>
        </div>
      ))}
    </Stagger>
  )
}

export function FootNote() {
  return (
    <p className="measure border-t border-edge pt-8 text-xs leading-relaxed text-fg-dim">
      NewEra is an independent project and is not affiliated with, endorsed by, or sponsored by
      Robinhood Markets, Inc. Nothing here is investment advice.{" "}
      <Link to="/app" className="scan-link text-acid-500">
        Open the live feed
      </Link>
    </p>
  )
}
