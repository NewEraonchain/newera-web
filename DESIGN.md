# DESIGN.md

Recorded from the built world. Product truth lives in `PRODUCT.md`.

**Direction: Aperture.** Chosen from `concept-seed --scope direction`, seed key
`34f3db55`, candidate 7 of 7.

## The world

The plane is dark and content is **unresolved** until the index looks at it. A
band of legibility tracks the pointer; everything outside it is present but not
yet readable. That is the product's thesis as a visual system rather than a
metaphor: you cannot see what is launching, and this can.

What this world explicitly refuses is the near-black-ground-plus-one-neon-accent
dashboard, which is the arrangement this category always ships — and which the
first two attempts at this site were.

No cards anywhere. Structure comes from rules, spacing and type.

## Color

`ink-950 #000000` (the void, point black) · `ink-900 #050607` ·
`ink-850 #0a0b0d` · `ink-800 #101215` · `ink-700 #171a1e`
`edge rgba(255,255,255,.07)` · `edge-strong rgba(255,255,255,.15)`

| Token | Value | Worst contrast | Job |
|---|---|---|---|
| `fg` | `#f2f4f2` | 15.79:1 | resolved |
| `fg-muted` | `#9aa39c` | 6.73:1 | body copy |
| `fg-dim` | `#868f88` | 5.24:1 | labels, meta |

**Lime `#cdff4d` is signal, never decoration**: risk scores, liveness, the
aperture's hairlines, the primary action. Never a heading, gradient or glow.
`warn #ffb454` marks duplicates, `danger #ff6b7a` marks high risk and spoofs.
`#8f1d27` is the destructive surface, because `danger` is a text colour and
fails at 2.25:1 as a background.

## Type

**Anybody Variable** for display — wdth 50–150 and wght 100–900. Each headline
line carries its own width and weight, so the block reads as a set composition
rather than three lines at one size; that is the reason for the face, since no
static family sets three widths from one file.

**The width axis is set, never animated.** Scroll velocity used to drive it, so
every display heading compressed as the page moved and released as it settled.
Read from the built site that is text stretching in and out while you scroll,
and it was reported exactly so. An effect nobody asked for, running on the words
they are trying to read, is a cost rather than a signature. Removing it also
removed what it had dragged in behind it — see the note on reflow under Motion.

**Archivo Variable** for long-form prose, where a display family would tire.
**Geist Mono Variable** for data, addresses, tickers, labels and all chrome.

Geist Mono ships a Cyrillic subset and neither of the others does, and that is
load-bearing: the impersonation examples set Cyrillic homoglyphs beside their
Latin twins, and in a face without coverage those characters fall back and the
mismatch gives the spoof away. **Homoglyphs are always set in the mono.**

Zero arbitrary `text-[Npx]` values in the codebase. `text-micro` (11px) is the
floor for functional text.

`.measure` is 54ch, not 68ch — the `ch` unit is the advance width of "0" and
prose glyphs average about a third narrower, so 68ch measured 91 characters.

## The aperture

One engine at the app root: a single pointermove listener and one rAF loop
drives every plate. Implemented as **one text node with a scrim above and below
the band**, not two stacked copies. The first version duplicated its children,
which meant duplicated DOM, an `aria-hidden` copy, a render prop so headings
could avoid emitting two `<h1>` tags, and genuinely occluded text that the
detector caught. The scrim gets the identical result with the real text left
alone at full contrast.

Three rules, which are accessibility constraints rather than styling:

1. **The accessible default is fully resolved.** The aperture is an enhancement
   over a legible page, never a mask over a hidden one. It engages only where a
   fine pointer and motion are both available, and only after the pointer has
   actually moved. Touch, keyboard, reduced motion and no-JS get everything lit.
2. **It never covers prose *or controls*.** Display type, the tape and comparison
   plates only. Anything a visitor has to read to decide, or click to act, stays
   resolved — a disclosure trigger dimmed to 1.16:1 is an invisible control,
   not an atmospheric one.
3. The band widens with scroll — by the end of the page everything is resolved.

## Chrome

**No centred pill navbar and no four-column footer link grid.** Those two
components are most of what makes a page read as every other page. Navigation is
a numbered mono index in difference blend that retires on scroll-down and
returns on scroll-up, because a background-less header collides with display
type passing under it. The mobile index is a full-bleed screen of display type.
The footer is anchored by the wordmark at plate scale.

## Motion

Three libraries, one job each, never the same property from two:

- **Lenis** owns scroll position.
- **GSAP + ScrollTrigger** own scroll-linked motion — the pinned pipeline, the
  marquee, the case-file assembly, the homoglyph scan.
- **Motion** owns state motion and `CountUp`'s spring.

The thesis is **accumulation and detection** — what the index does. Two focal
sequences: the case file writing itself under a clip wipe and then bracketing
the duplicates it finds; and the homoglyph scan marking every character that is
not what it appears to be, found by code point at render time.

**Animate from an already-visible default.** `gsap.from` applies its initial
state when the tween is built, leaving targets at `opacity: 0` from page load.
Use `fromTo` with `immediateRender: false` and a trigger that fires below the
fold.

**Never animate a figure from zero to its true value.** A count-up shows a wrong
number while it runs — captured mid-flight this page read "2.9x" where the
measurement is 4.2x. Claims render true immediately; counts animate from 92% of
target.

A scrubbed sequence must finish while its block is still travelling into view.

**The width axis may only drive text that cannot re-wrap.** `font-stretch`
changes glyph advances, so on text the browser is free to re-break it changes
how many lines there are — and a heading that gains or loses a line changes its
panel's height and the document's, on every frame of a scroll. Measured on the
landing page: 136 document-height changes and 215 layout shifts in one pass,
CLS 8.7 against a 0.1 threshold, panels oscillating 42px, and long tasks to
452ms. Freezing the axis with one `!important` rule took both counts to zero,
which is how it was identified. So the lines are fixed first — SplitText, one
`nowrap` box per rendered line — and the axis is driven on those, which is what
the hero has always done. The parent keeps the resting width so every re-split
measures the composition rather than whatever compression a scroll was passing
through.

**Every trigger's start is a number measured once, and the figures arrive
later.** GSAP refreshes on resize and on load, neither of which is a fetch
resolving, so a page whose panels change height when their data lands holds
stale offsets: the pinned pipeline engaged about 2300px early and covered the
viewport while the section before it was still being read — scrolling down went
pipeline, previous panel, pipeline. `SmoothScroll` now re-measures when the
document's own height settles. Two constraints on that: it must wait for the
reader to stop, because a refresh recalculates every trigger and doing it
mid-gesture cost a 1270ms frame and put the shifts back; and it must re-read the
height afterwards so a pin-spacer resizing during the refresh cannot feed back
into another one.

**Do not depend an effect on a polled object.** The pipeline's pin was built in
an effect keyed on the stats object, which the poller replaces every eight
seconds — four polls, twelve pin-spacer mutations. Idle that is only wasteful,
but a rebuild during a scroll recreates the scrubbed tween and the track snaps
to it. Key on the transition that actually matters, here the presence of data.
It also hid the stale-measurement bug above, because each rebuild silently
re-measured: a re-measure with a page teardown attached is not a fix.

## Components

**shadcn/ui for behaviour, not looks** — `dialog`, `accordion`, `tooltip`,
`button`, with semantic tokens aliased onto the palette above.

The onboarding dialog goes one step further and uses the **Radix primitive
directly** rather than `ui/dialog.tsx`: the wrapper hard-codes a rounded,
zooming, `bg-background` card, and those are exactly the parts we do not want.
Taken from it: focus trap, focus restore, escape, scroll lock, aria wiring.
Everything visible is ours — a square panel on point black, mono step index,
hairline progress, `.scan-row` choices, underline fields, `.block-btn` action.
Two details it does not give: the panel takes focus on open via
`onOpenAutoFocus` so a reader starts at the question, and Close is last in the
DOM and absolutely placed, so the first Tab of the flow offers the choices
rather than the way out.

**Interaction states live in `index.css`, not in utilities.** Every rule in that
file is *unlayered*, and unlayered CSS beats anything in Tailwind's `@layer
utilities` no matter how specific the utility is. So `absolute` loses to
`.scan-link`'s `position: relative`, `scale-y-100` cannot reopen a hairline the
base rule closed with `transform: scaleY(0)`, and `outline-none` cannot switch
off the document-wide focus ring. A new state of an existing component is a rule
next to that component — `.scan-row.is-on` is the selected row — and a genuine
exception is an explicit selector, as `[role="dialog"]:focus-visible` is.

**A sticky panel taller than the viewport must pin by its bottom edge.**
`position: sticky; top: 0` does *not* fall back to ordinary flow when the
element is too tall — it still pins at the top, and everything past the fold
inside it becomes unreachable, because there is nothing left to scroll and the
next panel arrives over the part nobody saw. Measured at 1440×900 before the
fix: panels of 973–1856px against a 900px viewport, with the last block of
three of them never more than 12% visible — the risk figures among them.
`StackPanel` now sets `top` to `-(height - viewport)` when it overflows, so the
panel travels fully through the viewport before locking and holds its end while
it is covered. Re-measured on resize and on content reflow, because the figures
load asynchronously and change the panel's height after mount.

**A covered panel does not transform, and body content does not animate in.**
Two separate versions of the same mistake — motion attached to content rather
than to a moment — both reported from the built site as the page looking
broken.

The panels had a pool of departures (scale 0.94, a 7deg `rotateX`, a drifting
scale) so no two consecutive ones left alike. The depth never read, because a
6% shrink against an identical near-black ground is not perceptible — but
everything the shrink uncovered did. `.stack-panel::before` is the arriving
edge at `rgba(255,255,255,.15)`, and scaled to 0.94 at 1440px it stops 43px
short of both sides. The light panel showed the whole failure at once: inverted
against the void, the shrink opened a dark strip down each edge with the
previous section legible through it — captured at 2x, its axis labels sat
beside the survival figures. Sticky does the overlap, the shadow says which
surface is in front, the hairline says where the new one starts; nothing else
was carrying anything.

`Rise`, `Wipe` and `Stagger` are now plain blocks for the same reason. `Article`
put a reveal around every section's prose, two around every Step, and a
*staggered* one around every bullet and definition list — so a content page ran
dozens of clip-path wipes, each firing at `top 88%`, uncovering blocks that were
already being read. At that density a reveal stops reading as an entrance and
starts reading as the page failing to draw. The identity is in the aperture, the
kinetic axis, the tape wall, the stacked panels, the case file and the homoglyph
scan — mechanics that happen once and carry an argument. Uncovering a paragraph
carries nothing; it only delays it.

**Verify this class of thing at 2x, cropped to the element.** A downscaled
full-page screenshot is not evidence: dimmed tape-wall glyphs read as colliding
rows in one, and the collision did not exist — the DOM had 11px gaps and a
single glyph size throughout.

**Entrance animations fill `backwards`, never `both`.** `.rise` ends on
`clip-path: inset(0 0 -12% 0)`, which looks identical to no clip but still crops
everything drawn outside the border box. With `both` that clip is permanent, and
focus rings are the first casualty: three sides vanish and the fourth is left
behind as a stray lime hairline.

**React Bits contributed the effects that had to be removed** — `SpotlightCard`
produced four `radial-spotlight-glow` findings and `ShinyText` both
`gradient-text` findings. Only `CountUp` survives.

One poller for `/intel/stats` shared across the whole page. Five components each
ran their own interval before, which meant five requests and five different
values of the same number on screen at once.

## Banned outright

Kickers above headings · cards inside cards · cards as page structure ·
gradient text · section numbers restating a sequence the structure carries ·
functional text below 11px · any figure not reproducible from a live API call.

That last one was being broken by the site's central claim. "4.2x risk
separation" was hardcoded into five places from a single hand-run of the
admin-gated backtest, and by the time anyone read it nobody could say whether it
was still true. It is now read from `GET /intel/separation`, which returns both
populations with their sample sizes, and the pages show the two survival rates
and derive the ratio from them rather than stating it. When the endpoint cannot
answer — not deployed, or a sample too thin to be conclusive — the landing page
renders nothing there and `/detection` falls back to the recorded pair,
labelled as recorded. **11px is the floor for a label, not for a sentence**;
prose at `text-micro` is what the detector's `tiny-text` rule catches, and it
caught it in both the dialog's terms line and the account page.

## Verification

`npx impeccable detect --json <url>`. **0 findings on all thirteen routes** —
`/`, `/app`, `/app/theme/:slug`, `/how-it-works`, `/detection`, `/themes`,
`/privacy`, `/docs`, `/about`, `/contact`, `/terms`, `/risk`, `/account`.

Always `--json`. In plain mode a clean run prints nothing, so a crashed run and
a clean one are indistinguishable and every count taken that way is
unfalsifiable. The same trap has a second form: the detector bundled with the
globally installed skill needs its own `puppeteer` and exits with an error when
scanning a URL without it — with stderr suppressed that error still leaves `[]`
on stdout, which reads exactly like a clean sweep. Use the npx package, and read
what the process actually wrote.

`/app/theme/:slug` is scanned with the onboarding dialog open, which is its
first-visit state. On 2026-08-01 it reported one `cramped-padding` — a `mb-8`
wrapper whose children sit flush against a left border — which reproduces
identically on the previous commit and so is data-dependent on whichever cluster
is live, not a regression. Unfixed and unaccepted; it needs a look with a
cluster that triggers it.

**The detector cannot see motion, so scroll health is measured separately.** It
reads a settled DOM, and every bug on this page lived in the frames between
settled states. What it takes: a `layout-shift` PerformanceObserver with
`e.sources` kept — the source elements are what turn "CLS is 8.7" into "this
heading is re-wrapping" — plus rAF deltas and `longtask`, sampled while driving
the page with real `mouse.wheel` events, because Lenis interpolates a `scrollTo`
straight back and never sees a programmatic scroll the way it sees a person.
Confirm a cause by removing it rather than by reading the code: an `!important`
author rule beats an inline style the ticker writes, which is how the width axis
was ruled in without touching the source. And check reading order separately
from CLS — `elementFromPoint` down the page, which is what caught a section
appearing, being replaced by one already passed, and appearing again. Measured
this way, `/` went CLS 6.56 → 2.15 under an identical sweep, of which 1.99 is
the pin's two inherent `position: fixed` transitions; `/detection` 0.23 → 0; and
p95 frame time roughly halved, 14ms → 7ms, on every content route.

## Signature mechanics

Clean is not the same as designed. A page can be typographically correct, well
spaced and completely inert — and the difference between that and a tier-1
surface is whether it owns mechanics nobody else could ship. These are ours.

**The aperture.** A band of legibility tracking the pointer; content is
unresolved outside it. `Aperture.tsx`, one engine, one rAF loop. Accessible
default is fully resolved.

**Set type on the width axis.** Three widths in one headline from one file —
still a composition no static family can set, now held still. `KineticText`
renders the heading element itself; wrapping heading text in an inner span makes
it read as body text to a detector and cost five `all-caps-body` findings before
it was collapsed. Two removed mechanics were once listed here as signatures, and
both turned out to be defects wearing the word:

- **Kinetic type** — the velocity-driven axis, above.
- **Rolling numerals** — a changed digit ran a keyframe starting at
  `translateY(0.9em)` with `opacity: 0` inside an `overflow-hidden` box, so for
  part of its 520ms it was transparent *and* outside its own box. The header's
  block height changes every eight seconds, several digits at a time; a capture
  of the hero caught `25,02 , 38` while the chain was at `25,022,338`. A real
  odometer needs the outgoing digit leaving as the incoming arrives so the column
  is never empty. A block height in 11px mono does not need selling, so it is
  `tabular-nums` and it ticks.

The test both failed: a mechanic has to survive being looked at on the built
page, at speed, by someone who did not design it.

**Resolving text.** Page slugs settle from a scramble, character by character.
The DOM always holds the real string; the scramble is written to an aria-hidden
span, so assistive tech and search never see noise.

**The tape wall.** Four rows of live tickers at display scale, alternating
directions, different speeds, with the aperture cutting across all of them. The
product's claim made physical: you cannot read all of it, which is the problem
NewEra exists to solve.

**The launch field.** One WebGL2 draw call, one point per token, positions
seeded from the address so the field is stable between renders. Risk drives
colour and size; the pointer pushes it aside. Raw WebGL, no library — the effect
is two shaders and a buffer. Positions need real bit mixing: a plain
`h * 31 + char` accumulator leaves x and y correlated and the field comes out as
diagonal streaks.

**Cinematic transitions.** Navigation is the aperture opening on the next page,
and a cluster row morphs into the page it opens via a shared
`view-transition-name` keyed by slug. Without the View Transitions API routes
swap instantly, which is the correct fallback.

Every one of these renders nothing, or renders plainly, when its capability is
missing — no WebGL2, no View Transitions, no JavaScript, or reduced motion. The
argument survives without the atmosphere.
