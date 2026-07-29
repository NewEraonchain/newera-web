import { Link } from "react-router-dom"

/* Shared layout for every long-form page: features, docs, about, legal.
   One place to change type rhythm rather than nine. */

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
    <div className="mx-auto max-w-3xl px-5 pb-28 pt-16">
      <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.09em] text-acid-500">
        {kicker}
      </p>
      <h1 className="font-display text-[clamp(1.9rem,4.5vw,3rem)] font-bold leading-[1.05] tracking-[-0.025em]">
        {title}
      </h1>
      {standfirst && (
        <p className="mt-5 text-[clamp(1rem,1.5vw,1.1rem)] leading-relaxed text-fg-muted">
          {standfirst}
        </p>
      )}
      <div className="mt-12 flex flex-col gap-12">{children}</div>
    </div>
  )
}

export function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section>
      {title && (
        <h2 className="mb-4 font-display text-[clamp(1.25rem,2.4vw,1.6rem)] font-bold tracking-[-0.015em]">
          {title}
        </h2>
      )}
      <div className="flex flex-col gap-4 text-[15px] leading-[1.75] text-fg-muted [&_b]:text-fg [&_strong]:text-fg [&_em]:text-fg">
        {children}
      </div>
    </section>
  )
}

/** Numbered step with a plain explanation and what runs underneath. */
export function Step({
  n,
  title,
  plain,
  runs,
}: {
  n: string
  title: string
  plain: string
  runs: React.ReactNode
}) {
  return (
    <div className="grid gap-4 rounded-2xl border border-edge bg-ink-850 p-6 md:grid-cols-[52px_1fr]">
      <div className="font-mono text-[13px] text-acid-500">{n}</div>
      <div>
        <h3 className="font-display text-[17px] font-bold tracking-[-0.01em] text-fg">{title}</h3>
        <p className="mt-2 text-[14.5px] leading-relaxed text-fg-muted">{plain}</p>
        <div className="mt-4 rounded-xl border border-edge bg-white/[.02] p-4">
          <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.08em] text-fg-dim">
            Underneath
          </span>
          <p className="text-[13.5px] leading-relaxed text-fg-dim">{runs}</p>
        </div>
      </div>
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
  const style = {
    info: "border-acid-500/25 bg-acid-500/[.06]",
    warn: "border-warn/25 bg-warn/[.06]",
    danger: "border-danger/25 bg-danger/[.06]",
  }[tone]
  return (
    <div className={`rounded-2xl border p-5 text-[14px] leading-relaxed text-fg-muted ${style}`}>
      {label && (
        <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.08em] text-fg">
          {label}
        </span>
      )}
      {children}
    </div>
  )
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 text-[14.5px] leading-relaxed text-fg-muted">
          <span className="mt-[9px] h-1 w-1 flex-none rounded-full bg-acid-500" />
          <span className="[&_b]:text-fg [&_strong]:text-fg">{it}</span>
        </li>
      ))}
    </ul>
  )
}

export function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md border border-edge bg-white/[.04] px-1.5 py-0.5 font-mono text-[13px] text-fg">
      {children}
    </code>
  )
}

/** Small definition grid — used for glossaries and score bands. */
export function Terms({ items }: { items: { term: string; body: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((t) => (
        <div key={t.term} className="rounded-2xl border border-edge bg-ink-850 p-5">
          <h4 className="font-display text-[14.5px] font-bold text-fg">{t.term}</h4>
          <p className="mt-2 text-[13.5px] leading-relaxed text-fg-dim">{t.body}</p>
        </div>
      ))}
    </div>
  )
}

export function FootNote() {
  return (
    <p className="border-t border-edge pt-6 text-[12px] leading-relaxed text-fg-faint">
      NewEra is an independent project and is not affiliated with, endorsed by, or sponsored by
      Robinhood Markets, Inc. Nothing here is investment advice.{" "}
      <Link to="/app" className="text-acid-500 hover:underline">
        Open the live feed
      </Link>
    </p>
  )
}
