import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

/* Self-hosted, so there is no third-party CDN in the critical path and no font
   request that leaks a visitor to Google. Both are variable — one file per
   subset covers every weight we use.
 *
 * Geist Mono carries a Cyrillic subset and the sans does not. That is load-
 * bearing, not incidental: the impersonation examples set Cyrillic homoglyphs
 * beside their Latin twins, and if those characters fell back to a different
 * face the mismatch would give the spoof away — which is the opposite of the
 * point. Homoglyphs are always set in the mono. */
import '@fontsource-variable/archivo'
import '@fontsource-variable/geist-mono'

import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
