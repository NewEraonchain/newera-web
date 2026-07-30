import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom"
import { useEffect, useState, lazy, Suspense } from "react"
import { useLenis } from "lenis/react"
import SmoothScroll from "@/components/SmoothScroll"
import { Header, Footer } from "@/components/site/Chrome"
import OnboardingModal from "@/components/OnboardingModal"
import { isOnboarded } from "@/lib/onboarding"
import Landing from "@/pages/Landing"

/* Landing stays eager — it is the entry point, and deferring it only buys a
   blank frame. Everything else loads on navigation so a visitor reading the
   marketing pages never downloads the feed's polling and charting code, and
   nobody downloads the legal pages until they ask for them. */
const Feed = lazy(() => import("@/pages/Feed"))
const ThemeDetail = lazy(() => import("@/pages/ThemeDetail"))
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

/* Router keeps scroll position between pages otherwise, which reads as broken.
   Braces matter: an effect that returns a non-undefined value crashes React 19
   on unmount.
 *
 * Goes through Lenis rather than window.scrollTo — Lenis owns the scroll
 * position, so a raw scrollTo gets interpolated back to where it was. immediate
 * skips the animation: a route change should land at the top, not glide there. */
function ScrollToTop() {
  const { pathname } = useLocation()
  const lenis = useLenis()
  useEffect(() => {
    if (lenis) lenis.scrollTo(0, { immediate: true })
    else window.scrollTo(0, 0)
  }, [pathname, lenis])
  return null
}

/* Held to the same min-height as a loaded page so the footer doesn't jump up
   and back down while a route chunk arrives. */
function RouteFallback() {
  return <div className="min-h-[70vh]" aria-busy="true" />
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-40">
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      <p className="mt-4 text-fg-muted">Coming next.</p>
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

  useEffect(() => {
    if (isOnboarded()) return
    if (GATED.some((p) => loc.pathname.startsWith(p))) setModal(true)
  }, [loc.pathname])

  return (
    <>
      <ScrollToTop />
      <Header />
      <main className="pt-16">
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<Feed />} />
          <Route path="/app/theme/:slug" element={<ThemeDetail />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/themes" element={<Themes />} />
          <Route path="/detection" element={<Detection />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/account" element={<Account />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/risk" element={<Risk />} />
          <Route path="*" element={<Placeholder title="Not found" />} />
        </Routes>
        </Suspense>
      </main>
      <Footer />
      <OnboardingModal
        open={modal}
        onClose={() => setModal(false)}
        onFinish={() => {
          setModal(false)
          navigate("/app")
        }}
      />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <SmoothScroll>
        <Shell />
      </SmoothScroll>
    </BrowserRouter>
  )
}
