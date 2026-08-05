import { RouterProvider, createBrowserRouter, Outlet, Link, useLocation, useNavigate, useNavigationType } from "react-router-dom"
import { useEffect, useState, lazy, Suspense } from "react"
import { useLenis } from "lenis/react"
import SmoothScroll from "@/components/SmoothScroll"
import Reticle from "@/components/Reticle"
import { ProgressRail } from "@/components/scroll"
import { useApertureEngine } from "@/components/Aperture"
import { Header, Footer } from "@/components/site/Chrome"
import OnboardingModal from "@/components/OnboardingModal"
import ErrorBoundary, { RouteError } from "@/components/ErrorBoundary"
import { isOnboarded, wasDeclined, ONBOARD_EVENT, ONBOARD_DONE_EVENT } from "@/lib/onboarding"
import Landing from "@/pages/Landing"

/* Landing stays eager — it is the entry point, and deferring it only buys a
   blank frame. Everything else loads on navigation so a visitor reading the
   marketing pages never downloads the feed's polling and charting code, and
   nobody downloads the legal pages until they ask for them. */
const Feed = lazy(() => import("@/pages/Feed"))
const ThemeDetail = lazy(() => import("@/pages/ThemeDetail"))
const Creator = lazy(() => import("@/pages/Creator"))
const Token = lazy(() => import("@/pages/Token"))
const Account = lazy(() => import("@/pages/Account"))
const HowItWorks = lazy(() => import("@/pages/content").then((m) => ({ default: m.HowItWorks })))
const Themes = lazy(() => import("@/pages/content").then((m) => ({ default: m.Themes })))
const Detection = lazy(() => import("@/pages/content").then((m) => ({ default: m.Detection })))
const About = lazy(() => import("@/pages/content").then((m) => ({ default: m.About })))
const Contact = lazy(() => import("@/pages/content").then((m) => ({ default: m.Contact })))
const Docs = lazy(() => import("@/pages/legal").then((m) => ({ default: m.Docs })))
const Terms = lazy(() => import("@/pages/legal").then((m) => ({ default: m.Terms })))
const Privacy = lazy(() => import("@/pages/legal").then((m) => ({ default: m.Privacy })))
const Risk = lazy(() => import("@/pages/legal").then((m) => ({ default: m.Risk })))

/* Scroll position across navigation.
 *
 * A new page lands at the top; Back returns you to where you were. The old
 * version did the first for every navigation type including POP, which made the
 * second impossible — and it fought two other systems while failing:
 *
 *   - The browser's own restoration was left on `auto`, so it also tried, and
 *     clamped its attempt to the height of a page that had not loaded yet.
 *   - The feed's data arrives ~1.3s after mount and roughly doubles the
 *     document, so anything that restores on mount restores against a skeleton.
 *
 * Measured on feed -> cluster -> Back, deterministically across four trials:
 * you left at y=2600, landed at 2189 (the clamp), then the page grew and the
 * viewport jerked to 5346 — 2,746px below where you had been, a second after it
 * looked settled.
 *
 * So: restoration is taken off the browser (`manual`), the target is stored per
 * history entry, and on POP it is re-applied over a short window while the
 * document is still growing, stopping as soon as the page is tall enough to
 * honour it. Everything goes through Lenis, which owns the scroll position —
 * a raw scrollTo gets interpolated straight back. */
const POS_KEY = "newera:scroll:"

/* One title for thirteen routes made tabs, history and bookmarks
   indistinguishable — a reader with the feed and two clusters open saw three
   identical tabs, and history search found nothing. Cluster pages set their own
   from the cluster label (see ThemeDetail), so this only supplies the fixed
   ones and deliberately does not fight it. */
const TITLES: Record<string, string> = {
  "/": "NewEra · Launch intelligence for Robinhood Chain",
  "/app": "Live feed · NewEra",
  "/how-it-works": "How it works · NewEra",
  "/detection": "Detection · NewEra",
  "/themes": "Clusters · NewEra",
  "/docs": "API · NewEra",
  "/about": "About · NewEra",
  "/contact": "Contact · NewEra",
  "/account": "Account · NewEra",
  "/terms": "Terms · NewEra",
  "/privacy": "Privacy · NewEra",
  "/risk": "Risk · NewEra",
}

function useDocumentTitle(pathname: string) {
  useEffect(() => {
    /* Normalised before the lookup. React Router matches case-insensitively and
       tolerates a trailing slash, so `/APP` and `/app/` both rendered the full
       live feed under the browser tab title "Not found · NewEra" — the map was
       keyed on the raw pathname and neither form was in it. */
    const key = pathname.toLowerCase().replace(/\/+$/, "") || "/"

    // The detail routes title themselves from their own data.
    if (
      key.startsWith("/app/theme/") ||
      key.startsWith("/app/creator/") ||
      key.startsWith("/app/token/")
    )
      return
    document.title = TITLES[key] ?? "Not found · NewEra"
  }, [pathname])
}

function ScrollManager() {
  const loc = useLocation()
  const navType = useNavigationType()
  const lenis = useLenis()

  /* Remember where this entry was left, cheaply and continuously.
   *
   * Nothing is written on the way out — the cleanup only cancels a queued
   * frame. Writing there is always too late and always wrong: React commits the
   * incoming page's DOM before it runs the outgoing effect's cleanup, so by then
   * the scroll position has already been reset or clamped against a document
   * that is no longer the one being left. Measured, leaving a feed at y=2639
   * recorded 0 when the write was deferred to rAF and 374 when it was made
   * synchronous. The value that is actually correct is the last one the scroll
   * listener saw while the page was still on screen, so the whole job of the
   * cleanup is to stop anything overwriting it. */
  useEffect(() => {
    const key = POS_KEY + loc.key
    let raf = 0
    const write = () => {
      try {
        sessionStorage.setItem(key, String(Math.round(window.scrollY)))
      } catch {
        // Storage disabled: losing the position is better than throwing.
      }
    }
    const save = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        write()
      })
    }
    window.addEventListener("scroll", save, { passive: true })
    return () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      window.removeEventListener("scroll", save)
    }
  }, [loc.key])

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual"

    const to = (y: number) => {
      if (lenis) lenis.scrollTo(y, { immediate: true })
      else window.scrollTo(0, y)
    }

    if (navType !== "POP") {
      to(0)
      return
    }

    const saved = Number(sessionStorage.getItem(POS_KEY + loc.key) ?? NaN)
    if (!Number.isFinite(saved) || saved <= 0) {
      to(0)
      return
    }

    /* The document is still filling in, so the target is re-applied every time
       it changes height rather than on a fixed timer. A timer loses twice: the
       feed's data can land later than any reasonable window, and once the loop
       gives up, scroll anchoring keeps adjusting the position as rows are
       inserted above the viewport. Measured with a 2s window: the restore
       clamped correctly to 2288 against a 3188px skeleton, then anchoring
       carried it to 4093 while the document grew to 6769.
     *
       `overflow-anchor: none` is set for the duration so anchoring cannot fight
       the restore, and released once the page is tall enough to hold the target
       and has stopped growing. */
    const root = document.documentElement
    const prevAnchor = root.style.overflowAnchor
    root.style.overflowAnchor = "none"

    let done = false
    let quiet: ReturnType<typeof setTimeout> | undefined
    const max = () => root.scrollHeight - window.innerHeight

    const finish = () => {
      if (done) return
      done = true
      ro.disconnect()
      clearTimeout(quiet)
      clearTimeout(giveUp)
      to(Math.min(saved, Math.max(0, max())))
      root.style.overflowAnchor = prevAnchor
    }

    const attempt = () => {
      if (done) return
      to(Math.min(saved, Math.max(0, max())))
      /* Tall enough, and no further growth for a full second: we are there.
       *
         250ms was not enough. This page loads in two waves — the feed, then the
         market lookup that fills "Getting traded" — and the second wave landed
         after the quiet window expired. Releasing `overflow-anchor` at that
         point handed the position to browser scroll anchoring, which pushed the
         viewport down as rows inserted above it: measured overshooting the
         restore by 848px, which the clamped restore itself cannot do. */
      if (max() >= saved) {
        clearTimeout(quiet)
        quiet = setTimeout(finish, 1000)
      }
    }

    const ro = new ResizeObserver(attempt)
    ro.observe(document.body)
    const giveUp = setTimeout(finish, 8000)
    attempt()

    return () => {
      done = true
      ro.disconnect()
      clearTimeout(quiet)
      clearTimeout(giveUp)
      root.style.overflowAnchor = prevAnchor
    }
  }, [loc.key, navType, lenis])

  return null
}

/* Held to the same min-height as a loaded page so the footer doesn't jump up
   and back down while a route chunk arrives. */
function RouteFallback() {
  return <div className="min-h-[70vh]" aria-busy="true" />
}

/* A wrong URL is not an unbuilt feature.
 *
 * This route reused a placeholder whose body read "Coming next." — written for
 * routes that did not exist yet, and rendered to anyone who mistyped or
 * followed a stale link. It told them the product was unfinished, and offered
 * no way onward: the page body contained zero links, leaving only the header
 * nav, which auto-hides on scroll. The cluster page already handles its own
 * not-found well; this is the same treatment. */
function NotFound() {
  return (
    <div className="mx-auto max-w-[42rem] px-[4vw] py-[18vh]">
      <h1 className="font-display text-[clamp(1.8rem,4vw,3rem)] font-extrabold uppercase leading-[0.95] tracking-[-0.03em]">
        No such page
      </h1>
      <p className="measure mt-6 text-base leading-relaxed text-fg-muted">
        That address does not match anything on NewEra. It may have been mistyped, or a link may
        have gone stale.
      </p>
      <div className="mt-8 flex flex-wrap gap-4">
        <Link to="/app" className="block-btn bg-acid-500 font-semibold text-ink-950">
          Go to the live feed
        </Link>
        <Link to="/" className="block-btn border border-edge-strong text-fg-muted">
          Back to the start
        </Link>
      </div>
    </div>
  )
}

/* App pages need a wallet to be worth anything, so a first-time visitor landing
   deep is prompted. The marketing pages and the feed itself stay open: the feed
   is the acquisition surface, and blocking it with a modal defeats that. */
const GATED = ["/app/theme"]

function Shell() {
  const loc = useLocation()
  const navigate = useNavigate()
  const [modal, setModal] = useState(false)

  // One pointer listener and one rAF loop drive every aperture on the page.
  useApertureEngine()
  useDocumentTitle(loc.pathname)

  /* How the dialog was opened decides two things: whether closing it counts as
     a decline, and whether finishing navigates. A visitor who pressed "Get
     started" mid-article did not ask to be moved to the feed, and dismissing
     something you opened yourself is not declining an interruption. */
  const [source, setSource] = useState<"gate" | "manual">("gate")

  useEffect(() => {
    if (isOnboarded() || wasDeclined()) return
    if (GATED.some((p) => loc.pathname.startsWith(p))) {
      setSource("gate")
      setModal(true)
    }
  }, [loc.pathname])

  /* Opening it because someone asked. Deliberately not subject to the checks
     above: `wasDeclined` exists to stop the dialog interrupting, not to refuse
     a visitor who pressed "Get started". */
  useEffect(() => {
    const open = () => {
      setSource("manual")
      setModal(true)
    }
    window.addEventListener(ONBOARD_EVENT, open)
    return () => window.removeEventListener(ONBOARD_EVENT, open)
  }, [])

  return (
    <>
      <ScrollManager />
      <ProgressRail />
      <Reticle />
      {/* First stop for the keyboard.
       *
       * The nav carries the wordmark, six numbered routes, an account entry and
       * the menu control before `main` begins: measured, the first control on
       * the feed — the search field — was 41 tabs from the top of the document,
       * and every route change put a reader back at tab 1. This is the standard
       * escape hatch and it is the first focusable node on the page. It stays
       * off-screen until focused, and `focus:` is enough because it can only be
       * reached by keyboard. */}
      <a
        href="#main"
        className="sr-only z-[60] focus:not-sr-only focus:fixed focus:left-[var(--gutter)] focus:top-4 focus:border focus:border-acid-500 focus:bg-ink-950 focus:px-4 focus:py-3 focus:font-mono focus:text-xs focus:uppercase focus:tracking-[0.12em] focus:text-acid-500"
      >
        Skip to content
      </a>
      <Header />
      {/* tabIndex -1 so the skip link's target can actually take focus; without
          it the browser scrolls but the next Tab resumes from the nav. */}
      <main id="main" tabIndex={-1} className="pt-16 outline-none">
        {/* Keyed on the path so navigating away from a broken route clears the
            error — without the key a single bad page would poison every
            subsequent navigation and the site would stay broken until reload. */}
        <ErrorBoundary key={loc.pathname} scope="route">
        <Suspense fallback={<RouteFallback />}>
        <Outlet />
        </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <OnboardingModal
        open={modal}
        source={source}
        onClose={() => setModal(false)}
        onFinish={() => {
          setModal(false)
          window.dispatchEvent(new CustomEvent(ONBOARD_DONE_EVENT))
          // Only the gated path earns a redirect: it interrupted a deep link,
          // so it owes the visitor a destination. A manual open closes in place.
          if (source === "gate") navigate("/app")
        }}
      />
    </>
  )
}

/* A data router, for one reason: view transitions.
 *
 * DESIGN.md lists "a cluster row morphs into the page it opens" as a signature
 * mechanic, and it had never once run. Measured: 14 elements carried a
 * `view-transition-name`, the browser supported the API, and
 * `document.startViewTransition` was called ZERO times on a navigation. React
 * Router ignores `<Link viewTransition>` under a declarative `<BrowserRouter>`
 * — the prop only reaches an implementation that can honour it when the router
 * is a data router.
 *
 * Deliberately one splat route rather than a converted route table. `Shell`
 * already owns the chrome, the scroll manager and the per-route error boundary,
 * and its inner `<Routes>` keeps matching exactly as before; moving fifteen
 * routes into loaders and layout routes would change scroll restoration and
 * error handling, both of which took several attempts to get right. */
const router = createBrowserRouter([
  {
    element: (
      <SmoothScroll>
        <Shell />
      </SmoothScroll>
    ),
    children: [
      { path: "/", element: <Landing /> , errorElement: <RouteError /> },
      { path: "/app", element: <Feed /> , errorElement: <RouteError /> },
      { path: "/app/theme/:slug", element: <ThemeDetail /> , errorElement: <RouteError /> },
      { path: "/app/creator/:wallet", element: <Creator /> , errorElement: <RouteError /> },
      { path: "/app/token/:address", element: <Token /> , errorElement: <RouteError /> },
      { path: "/how-it-works", element: <HowItWorks /> , errorElement: <RouteError /> },
      { path: "/themes", element: <Themes /> , errorElement: <RouteError /> },
      { path: "/detection", element: <Detection /> , errorElement: <RouteError /> },
      { path: "/docs", element: <Docs /> , errorElement: <RouteError /> },
      { path: "/about", element: <About /> , errorElement: <RouteError /> },
      { path: "/contact", element: <Contact /> , errorElement: <RouteError /> },
      { path: "/account", element: <Account /> , errorElement: <RouteError /> },
      { path: "/terms", element: <Terms /> , errorElement: <RouteError /> },
      { path: "/privacy", element: <Privacy /> , errorElement: <RouteError /> },
      { path: "/risk", element: <Risk /> , errorElement: <RouteError /> },
      { path: "*", element: <NotFound /> , errorElement: <RouteError /> },
    ],
  },
])

export default function App() {
  return (
    /* The outer boundary catches anything the per-route one cannot — the
       header, the footer, the scroll engine — so a failure there still leaves
       a page with an explanation and a way out rather than an empty document. */
    <ErrorBoundary scope="app">
      <RouterProvider router={router} />
    </ErrorBoundary>
  )
}
