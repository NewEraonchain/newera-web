import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import { Header, Footer } from "@/components/site/Chrome"
import OnboardingModal from "@/components/OnboardingModal"
import { isOnboarded } from "@/lib/onboarding"
import Landing from "@/pages/Landing"
import Feed from "@/pages/Feed"
import ThemeDetail from "@/pages/ThemeDetail"
import Account from "@/pages/Account"
import { HowItWorks, Themes, Detection, About, Contact } from "@/pages/content"
import { Docs, Terms, Privacy, Risk } from "@/pages/legal"

/* Router keeps scroll position between pages otherwise, which reads as broken.
   Braces matter: an effect that returns a non-undefined value crashes React 19
   on unmount. */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
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
      <Shell />
    </BrowserRouter>
  )
}
