# Audit and regression harness

Browser-driven checks for things a linter cannot see: what the page does while
it is *moving*, what it says when a request fails, and whether a promise in the
copy is backed by anything.

These exist because the impeccable detector reported every route clean while the
landing page was running a CLS of 8.7, the feed was rewriting itself under the
reader, and three pages were quoting a statistic 51% adrift from the live API.
A settled DOM is not the product.

## Running them

Needs a dev server already up (`npm run dev`, port 5173) and `puppeteer-core`,
which is **not** a project dependency:

```
cd newera-web/tools/audit
npm init -y && npm i puppeteer-core     # once
node stability.mjs 5173
```

Chrome is expected at `C:\Program Files\Google\Chrome\Application\chrome.exe`;
edit the `CHROME` constant if it moves.

Most take the port as the first argument. Some take a live cluster slug as the
second — get one from
`https://newerabackend-production.up.railway.app/intel/themes?limit=1`.

## The suites

Each prints `PASS`/`FAIL` per assertion. These are the guarantees, not just
observations — a FAIL means a behaviour regressed.

| Script | Guarantees |
|---|---|
| `stability.mjs` | A stationary reader does not drift and the row under them does not change; held updates are offered when the index actually moved on, and only then; Back restores the exact scroll position and stays there |
| `fixcheck.mjs` | A market-lookup outage never becomes a claim about the tokens; an API outage explains itself instead of pulsing forever; an unrenderable field recovers instead of blanking the document; onboarding fires one event, does not decline on self-open, restores focus, and syncs the header |
| `honesty.mjs` | No frozen statistic anywhere; the live figure matches `/intel/stats` in the same run; no market-timing language; `/contact` and `/privacy` promise only channels that exist; the docs describe the real UI and print the API base URL |
| `onboard.mjs` | Onboarding is reachable from every page, does not interrupt the feed, still gates deep links, survives a decline, and switches to Account when done |
| `ghosts.mjs` | Nothing is left invisible or clipped after a full scroll of every route |
| `reticle.mjs` | The custom cursor stays visible and tracking above the dialog |
| `stretch.mjs` | No element animates its font width axis (the "text stretching while scrolling" report) |
| `ux-audit.mjs` | Dead links, unnamed controls, unlabelled inputs, heading order, focus rings, tap-target sizes, console errors, mobile overflow — across every route |
| `detect-all.ps1` | `npx impeccable detect --json` on all 13 routes. **Always `--json`** — in plain mode a clean run and a crashed run are both silent |

## Diagnostics

Not pass/fail — they answer "why". `jank.mjs` (frame times, long tasks, layout
shifts *with their source elements*), `osc.mjs` (document-height oscillation,
with a `freeze` argument that proves a cause by removing it), `sweep.mjs` (CLS
and frame times per route), `loadpop.mjs` (DOM churn after first paint),
`panelscan.mjs` (sticky panel geometry), `whatsonscreen.mjs` (reading order down
a page), `backdebug.mjs` (scroll-position store across a Back), `poison.mjs`
(error boundary under a drifted field), `digits.mjs` (live figure never renders
malformed), `tiny.mjs` / `caps.mjs` / `widths.mjs` (locate the exact element
behind a detector finding), `crop.mjs` / `shot-at.mjs` / `film.mjs` (screenshots).

## Traps these were written around

- **Drive with `page.mouse.wheel`.** Lenis owns scroll; it never sees a
  programmatic `scrollTo` the way it sees a person, and interpolates it back.
- **Crop at `deviceScaleFactor: 2` before believing a visual bug.** A
  downscaled full-page screenshot made dimmed tape-wall glyphs look like
  colliding rows; the DOM had 11px gaps and one glyph size throughout.
- **Injected responses need `Access-Control-Allow-Origin`,** or the browser
  blocks them and the app sees a network failure instead of your payload.
- **Prove a cause by removing it.** An `!important` author rule beats an inline
  style a ticker writes — that is how the width axis was ruled in without
  touching source.
- **`git stash push -- newera-web/src`, re-run, unstash.** The only way to know
  whether a number is an improvement or was always that way.
