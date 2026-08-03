# Audit and regression harness

Browser-driven checks for things a linter cannot see: what the page does while
it is *moving*, what it says when a request fails, and whether a promise in the
copy is backed by anything.

These exist because the impeccable detector reported every route clean while the
landing page was running a CLS of 8.7, the feed was rewriting itself under the
reader, and three pages were quoting a statistic 51% adrift from the live API.
A settled DOM is not the product.

## Running them

Needs a dev server already up (`npm run dev`, port 5173). `puppeteer-core` is
now a declared devDependency of `newera-web` — the repo split had lost it, and
every browser suite here imported a package that was not installed:

```
npm i                    # from newera-web/
node tools/audit/swap.mjs
node tools/audit/stability.mjs 5173
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
| `swap.mjs` | **The money one.** Imports `src/lib/swap.ts`, `v4.ts` and `trades.ts` themselves (bundled on the fly with esbuild, so it tests the shipped code, not copies) and checks them against the live chain: both the v3 and v4 encodings reproduce real successful on-chain swaps byte for byte, well-formed buys simulate cleanly on each protocol, an unreachable minimum reverts, a sell without a Permit2 grant fails rather than sending, the builders refuse a zero minimum or zero input, unroutable pools decline with a stated reason instead of guessing a key, and the tape's buy/sell labels agree with the transactions' own ETH values |
| `terminal.mjs` | The token terminal in a browser: a live quote renders, the guaranteed minimum sits below it, raising slippage actually lowers the floor, timeframe buttons drive the embed's `interval`, the tape resolves to real rows or an *explained* empty state, no router address is ever shown as a trader, the Sell tab flips what the amount means and discloses its approvals, and v4 pages either route or decline with a reason |
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
- **A test that only watches for reverts passes when everything reverts.** The
  first version of `swap.mjs` reported "slippage enforced" while every swap was
  broken — the guard check and the it-works check must both be present, and the
  guard means nothing without the other.
- **Uniswap's deployment here does not match Uniswap's docs — twice.** This
  chain's `V3_SWAP_EXACT_IN` input takes a sixth, empty `bytes` parameter (the
  documented five-parameter form reverts `SliceOutOfBounds()`), and its v4
  `ExactInputSingleParams` still carries `sqrtPriceLimitX96`, which newer
  v4-periphery dropped. Decode a real transaction before trusting an ABI —
  `swap.mjs` pins both layouts against known-good mainnet swaps for this reason.
- **A v4 quoter reverting `NotEnoughLiquidity` may be telling the truth.** Most
  v4 launch pools here are drained: a live price with nothing behind it. The
  quoter is the authority on tradeability, not `getLiquidity` — zero liquidity
  *at the current tick* still trades, because the swap crosses into the next one.
- **Bundle to somewhere inside the repo.** `esbuild` with `external: ["viem"]`
  emitting to the system temp dir produces a file that cannot resolve `viem`,
  because node walks up from the *importing file* looking for `node_modules`.
- **`npx tsc --noEmit` checks NOTHING here.** The root `tsconfig.json` is
  `{"files": []}` with project references, so a bare run is silently vacuous.
  Typecheck with `npm run build` (which runs `tsc -b`) or `tsc -b` directly.
- **`innerText` reflects CSS `text-transform`.** A label with an `uppercase`
  class reads back as "YOU PAY (…)", so case-sensitive assertions on rendered
  copy fail for reasons that have nothing to do with the copy.
- **Don't assert a tight slippage floor against a live market.** Blocks are
  ~100ms; a 1% minimum computed at quote time is routinely stale by the time a
  simulation runs. That is the protection working. Use a wide slippage to test
  the *encoding*, and a deliberately unreachable minimum to test the *guard*.
- **The node errors above 10,000 logs; it does not truncate.** A wide
  `getLogs` window that "worked" may only have worked because the pool was
  young. Start narrow and widen.
