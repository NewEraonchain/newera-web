import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"

function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M16 3 L27 26 H5 Z" stroke="#cdff4d" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M16 12 L21.5 23 H10.5 Z" fill="#cdff4d" />
    </svg>
  )
}

const NAV = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/themes", label: "Themes" },
  { to: "/detection", label: "Detection" },
  { to: "/docs", label: "Docs" },
]

export function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const loc = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Close the mobile menu on navigation, or it stays open behind the new page.
  useEffect(() => {
    setOpen(false)
  }, [loc.pathname])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-edge bg-ink-950/80 backdrop-blur-xl"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight">
          <Mark />
          NewEra
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={`rounded-lg px-3.5 py-2 text-sm transition-colors ${
                loc.pathname === n.to
                  ? "text-fg"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/app"
            className="rounded-xl bg-acid-500 px-4 py-2 text-sm font-bold text-[#0a0d05] transition-[filter] hover:brightness-105"
          >
            Open feed
          </Link>
          <button
            className="rounded-lg p-2 text-fg-muted md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={open}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-edge bg-ink-950/95 px-5 py-3 backdrop-blur-xl md:hidden">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="block rounded-lg px-2 py-3 text-base text-fg-muted hover:text-fg"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}

export function Footer() {
  return (
    <footer className="border-t border-edge bg-ink-950">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <div className="mb-3 flex items-center gap-2.5 font-display text-lg font-bold">
              <Mark />
              NewEra
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-fg-dim">
              Launch intelligence for Robinhood Chain. Read meaning at the moment of creation.
            </p>
            <div className="mt-4 flex gap-2">
              <a
                href="https://x.com/New_EraAI"
                target="_blank"
                rel="noopener"
                aria-label="X"
                className="grid h-9 w-9 place-items-center rounded-lg border border-edge text-fg-dim transition-colors hover:border-edge-strong hover:text-fg"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>

          <FootCol
            title="Product"
            links={[
              ["/app", "Live feed"],
              ["/themes", "Theme intelligence"],
              ["/detection", "Detection"],
              ["/docs", "API docs"],
            ]}
          />
          <FootCol
            title="Company"
            links={[
              ["/about", "About"],
              ["/contact", "Contact"],
            ]}
          />
          <FootCol
            title="Legal"
            links={[
              ["/terms", "Terms"],
              ["/privacy", "Privacy"],
              ["/risk", "Risk"],
            ]}
          />
        </div>

        <div className="mt-12 border-t border-edge pt-6">
          <div className="flex flex-wrap justify-between gap-3 text-xs text-fg-dim">
            <span>© 2026 NewEra. All rights reserved.</span>
            <span>Not investment advice. Nothing here is a price forecast.</span>
          </div>
          {/* measure, not max-w-3xl: 768px of 12px text runs to ~128 characters
              a line, which is where the eye stops finding the line return. The
              wording is required by Robinhood Chain's terms and does not
              change — only how wide it sets. */}
          <p className="measure mt-3 text-xs leading-relaxed text-fg-dim">
            NewEra is an independent project and is not affiliated with, endorsed by, or sponsored
            by Robinhood Markets, Inc. "Robinhood Chain" is used solely to identify the public
            blockchain network this product indexes.
          </p>
        </div>
      </div>
    </footer>
  )
}

function FootCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      {/* h3, not h4: pages close on an h2, so an h4 here skips a level and
          breaks the document outline screen readers navigate by. */}
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fg-dim">
        {title}
      </h3>
      <div className="flex flex-col gap-2">
        {links.map(([to, label]) => (
          <Link
            key={to}
            to={to}
            className="text-sm text-fg-muted transition-colors hover:text-acid-500"
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  )
}
