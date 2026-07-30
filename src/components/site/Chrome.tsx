import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { useStats } from "@/lib/useStats"

/* Chrome, in the Aperture vocabulary.
 *
 * No centred pill navbar and no four-column footer link grid: those are the
 * two components that make a page read as every other page, and the direction
 * has to reach the furniture or it is only a coat of paint. Navigation is a
 * numbered mono index; the footer is anchored by the wordmark at plate scale
 * rather than by columns. */

const NAV = [
  { to: "/app", label: "Live feed" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/detection", label: "Detection" },
  { to: "/themes", label: "Clusters" },
  { to: "/docs", label: "API" },
]

export function Header() {
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const loc = useLocation()
  const stats = useStats()

  useEffect(() => {
    setOpen(false)
  }, [loc.pathname])

  /* The header has no background — it sits on the page in difference blend so
     it stays legible over anything. That works until a display heading scrolls
     under it and the two sets of letterforms collide.
   *
     Retiring it on the way down and returning it on the way up costs nothing
     while reading and puts navigation back the instant it is wanted. */
  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (Math.abs(y - last) < 6) return
      setHidden(y > last && y > 120)
      last = y
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // A full-bleed overlay that leaves the page scrolling behind it reads as a
  // bug the moment you flick the menu.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 mix-blend-difference transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          hidden && !open ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="flex items-start justify-between px-[4vw] py-[3.2vh]">
          <Link
            to="/"
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-white"
          >
            NewEra
            <span className="mx-2 opacity-40">/</span>
            <span className="opacity-70">Robinhood Chain</span>
            {stats && (
              <>
                <span className="mx-2 opacity-40">/</span>
                <span>{Number(stats.indexedThroughBlock).toLocaleString("en-US")}</span>
              </>
            )}
          </Link>

          <nav className="hidden items-start gap-7 md:flex">
            {NAV.map((n, i) => (
              <Link
                key={n.to}
                to={n.to}
                className="group font-mono text-[11px] uppercase tracking-[0.12em] text-white"
              >
                <span className="mr-1.5 opacity-40">{String(i + 1).padStart(2, "0")}</span>
                <span className={loc.pathname === n.to ? "" : "opacity-70 group-hover:opacity-100"}>
                  {n.label}
                </span>
              </Link>
            ))}
          </nav>

          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-white md:hidden"
          >
            {open ? "Close" : "Index"}
          </button>
        </div>
      </header>

      {/* The mobile index, at display scale. A stacked list of small links is
          the thing every site does; this is the one screen where the type can
          be the interface. */}
      {open && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-ink-950 px-[4vw] pb-[8vh] md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV.map((n, i) => (
              <Link
                key={n.to}
                to={n.to}
                className="flex items-baseline gap-4 font-display text-[13vw] font-extrabold uppercase leading-[0.92] tracking-[-0.03em]"
                style={{ fontStretch: "72%" }}
              >
                <span className="font-mono text-[11px] font-normal tracking-[0.12em] text-fg-dim">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-edge bg-ink-950 px-[4vw] pb-[6vh] pt-[12vh]">
      <div className="flex flex-wrap items-end justify-between gap-x-16 gap-y-10">
        <span
          className="font-display text-[15vw] font-extrabold uppercase leading-[0.8] tracking-[-0.04em] text-unresolved sm:text-[13vw]"
          style={{ fontStretch: "68%" }}
          aria-hidden
        >
          NewEra
        </span>

        <nav className="flex flex-wrap gap-x-10 gap-y-3">
          {[
            ["/app", "Live feed"],
            ["/how-it-works", "How it works"],
            ["/detection", "Detection"],
            ["/docs", "API"],
            ["/about", "About"],
            ["/contact", "Contact"],
            ["/terms", "Terms"],
            ["/privacy", "Privacy"],
            ["/risk", "Risk"],
          ].map(([to, label]) => (
            <Link
              key={to}
              to={to}
              className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-dim transition-colors hover:text-acid-500"
            >
              {label}
            </Link>
          ))}
          <a
            href="https://x.com/New_EraAI"
            target="_blank"
            rel="noopener"
            className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-dim transition-colors hover:text-acid-500"
          >
            X ↗
          </a>
        </nav>
      </div>

      <div className="mt-[8vh] flex flex-wrap justify-between gap-x-10 gap-y-4 border-t border-edge pt-6 font-mono text-[11px] leading-relaxed text-fg-dim">
        <span>© 2026 NewEra</span>
        <span>Not investment advice. Nothing here is a price forecast.</span>
      </div>

      {/* Required verbatim by Robinhood Chain's terms. The wording does not
          change — only how wide it sets. */}
      <p className="measure mt-4 font-mono text-[11px] leading-relaxed text-fg-dim">
        NewEra is an independent project and is not affiliated with, endorsed by, or sponsored by
        Robinhood Markets, Inc. &quot;Robinhood Chain&quot; is used solely to identify the public
        blockchain network this product indexes.
      </p>
    </footer>
  )
}
