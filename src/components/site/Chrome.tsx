import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { useLenis } from "lenis/react"
import { useStats } from "@/lib/useStats"
import { RollingNumber } from "@/components/kinetic"
import { isOnboarded, openOnboarding, ONBOARD_DONE_EVENT } from "@/lib/onboarding"

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

  /* A full-bleed overlay that leaves the page scrolling behind it reads as a
     bug the moment you flick the menu — and `body { overflow: hidden }` alone
     does not stop it, because Lenis owns the window scroll as `root` and
     ignores the rule entirely. Measured with the menu open: a wheel over the
     overlay moved the page from 1200 to 1793. Native touch dragging *was*
     blocked, so this only ever leaked to wheel, trackpad and programmatic
     scrolling — which is exactly what a desktop user at 400% zoom has, since
     the desktop nav is `display: none` below `md` and this menu is their only
     navigation.
   *
     Escape closes it too. It was the one dismissible surface on the site that
     ignored the key. */
  const lenis = useLenis()
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    if (open) lenis?.stop()
    else lenis?.start()

    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
    }
  }, [open, lenis])

  useEffect(
    () => () => {
      document.body.style.overflow = ""
      lenis?.start()
    },
    [lenis]
  )

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
            className="-my-2 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white"
          >
            NewEra
            <span className="mx-2 opacity-40">/</span>
            <span className="opacity-70">Robinhood Chain</span>
            {stats && (
              <>
                <span className="mx-2 opacity-40">/</span>
                <RollingNumber value={Number(stats.indexedThroughBlock)} />
              </>
            )}
          </Link>

          {/* -my-2 py-2: the hit area grows to 33px without moving the type.
              At 11px mono these links measured 17px tall, under the 24px WCAG
              2.2 floor and well under the 44px anyone actually wants — the
              whole navigation was a row of hairline targets. */}
          <nav className="-my-2 hidden items-start gap-7 md:flex">
            {NAV.map((n, i) => (
              <Link
                key={n.to}
                to={n.to}
                viewTransition
                className="group py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white"
              >
                <span className="mr-1.5 opacity-40">{String(i + 1).padStart(2, "0")}</span>
                <span className={loc.pathname === n.to ? "" : "opacity-70 group-hover:opacity-100"}>
                  {n.label}
                </span>
              </Link>
            ))}
            <AccountEntry />
          </nav>

          {/* -m-3 p-3: a 40x17 hit area became 64x41. This is the ONLY
              navigation control on a phone and it was the smallest target on
              the site — it was missed when the header and footer links were
              enlarged. */}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="-m-3 p-3 font-mono text-[11px] uppercase tracking-[0.12em] text-white md:hidden"
          >
            {open ? "Close" : "Index"}
          </button>
        </div>
      </header>

      {/* The mobile index, at display scale. A stacked list of small links is
          the thing every site does; this is the one screen where the type can
          be the interface. */}
      {open && (
        /* `overflow-y-auto` and `mt-auto` rather than `justify-end`.
         *
         * A `justify-end` flex column cannot scroll to reveal what it has
         * pushed off the top: measured at 667x375 the content was 503px tall in
         * a 375px viewport, putting "01 Live feed" at top:-154 and "02 How it
         * works" at top:-70, both unreachable — `scrollTop = 9999` stayed 0. Any
         * phone in landscape lost the product's primary destination from its
         * only menu. `mt-auto` keeps the bottom-anchored composition when it
         * fits and lets it scroll when it does not.
         *
         * `role="dialog"` + `aria-modal` because it behaves as one; the type is
         * the interface here, so it is not worth pulling in Radix for. Focus
         * containment is below. */
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Site index"
          ref={(el) => {
            // Focus has to be inside for the trap to contain anything, and a
            // keyboard user opening the menu should land on the first
            // destination rather than wherever they were.
            if (el && !el.contains(document.activeElement)) {
              el.querySelector<HTMLElement>("a[href], button")?.focus()
            }
          }}
          className="fixed inset-0 z-40 flex flex-col overflow-y-auto overscroll-contain bg-ink-950 px-[4vw] pb-[8vh] pt-[14vh] md:hidden"
          onKeyDown={(e) => {
            if (e.key !== "Tab") return
            const items = e.currentTarget.querySelectorAll<HTMLElement>("a[href], button")
            if (!items.length) return
            const first = items[0]
            const last = items[items.length - 1]
            // Without this, Tab walked straight out of an opaque overlay into
            // the page behind it — focused, invisible, and scrolling.
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault()
              last.focus()
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault()
              first.focus()
            }
          }}
        >
          <nav className="mt-auto flex flex-col gap-1">
            {NAV.map((n, i) => (
              <Link
                key={n.to}
                to={n.to}
                viewTransition
                className="flex items-baseline gap-4 font-display text-[13vw] font-extrabold uppercase leading-[0.92] tracking-[-0.03em]"
                style={{ fontStretch: "72%" }}
              >
                <span className="font-mono text-[11px] font-normal tracking-[0.12em] text-fg-dim">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {n.label}
              </Link>
            ))}
            <AccountEntry mobile onNavigate={() => setOpen(false)} />
          </nav>
        </div>
      )}
    </>
  )
}

/* The way in, on every page.
 *
 * Onboarding used to open on cluster detail pages and nowhere else, with no
 * control anywhere that opened it — so anyone arriving on the feed, or anyone
 * who dismissed it once, simply had no way to start. This is that control, and
 * it changes to point at the account once there is an account to point at.
 *
 * It listens rather than reading once. The earlier version read `isOnboarded()`
 * at mount on the grounds that "connecting reloads the page" — true of
 * `/account`, which calls `location.reload()`, and false of the dialog, which
 * finishes with a client-side navigate. The header never remounted, so the
 * reward for completing onboarding was a nav still inviting you to start it,
 * with no route to the account you had just made. */
function AccountEntry({ mobile, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const [done, setDone] = useState(isOnboarded)

  useEffect(() => {
    const sync = () => setDone(isOnboarded())
    window.addEventListener(ONBOARD_DONE_EVENT, sync)
    // Another tab connecting counts too.
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(ONBOARD_DONE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  if (mobile) {
    return done ? (
      <Link
        to="/account"
        viewTransition
        onClick={onNavigate}
        className="flex items-baseline gap-4 font-display text-[13vw] font-extrabold uppercase leading-[0.92] tracking-[-0.03em]"
        style={{ fontStretch: "72%" }}
      >
        <span className="font-mono text-[11px] font-normal tracking-[0.12em] text-fg-dim">06</span>
        Account
      </Link>
    ) : (
      <button
        type="button"
        onClick={() => {
          onNavigate?.()
          openOnboarding("nav-mobile")
        }}
        className="flex items-baseline gap-4 text-left font-display text-[13vw] font-extrabold uppercase leading-[0.92] tracking-[-0.03em] text-acid-500"
        style={{ fontStretch: "72%" }}
      >
        <span className="font-mono text-[11px] font-normal tracking-[0.12em] text-fg-dim">06</span>
        Get started
      </button>
    )
  }

  return done ? (
    <Link
      to="/account"
      viewTransition
      className="group py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white"
    >
      <span className="mr-1.5 opacity-40">06</span>
      <span className="opacity-70 group-hover:opacity-100">Account</span>
    </Link>
  ) : (
    <button
      type="button"
      onClick={() => openOnboarding("nav")}
      className="py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white"
    >
      <span className="mr-1.5 opacity-40">06</span>
      <span className="underline decoration-1 underline-offset-4">Get started</span>
    </button>
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

        {/* py-1.5 on each link, with the row's gap reduced to match, so every
            target clears 24px without opening the footer up. Nine 17px-tall
            links in a wrapping row is the hardest thing on the site to hit.
            px-1.5 too, because that only fixed the height: "API" is three
            glyphs of 11px mono and measured 23px wide — one pixel under the
            floor, and the only target on the site still failing it. */}
        <nav className="-my-1.5 flex flex-wrap gap-x-8">
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
              className="px-1.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-fg-dim transition-colors hover:text-acid-500"
            >
              {label}
            </Link>
          ))}
          <a
            href="https://x.com/New_EraAI"
            target="_blank"
            rel="noopener"
            className="px-1.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-fg-dim transition-colors hover:text-acid-500"
          >
            X ↗
          </a>
        </nav>
      </div>

      {/* text-xs, not 11px. Both of these are sentences, and 11px is the floor
          for a label — the disclaimer that matters most legally was the least
          readable text on the site. */}
      <div className="mt-[8vh] flex flex-wrap justify-between gap-x-10 gap-y-4 border-t border-edge pt-6 font-mono text-xs leading-relaxed text-fg-dim">
        <span>© 2026 NewEra</span>
        <span>Not investment advice. Nothing here is a price forecast.</span>
      </div>

      {/* Required verbatim by Robinhood Chain's terms. The wording does not
          change — only how wide it sets. */}
      <p className="measure mt-4 font-mono text-xs leading-relaxed text-fg-dim">
        NewEra is an independent project and is not affiliated with, endorsed by, or sponsored by
        Robinhood Markets, Inc. &quot;Robinhood Chain&quot; is used solely to identify the public
        blockchain network this product indexes.
      </p>
    </footer>
  )
}
