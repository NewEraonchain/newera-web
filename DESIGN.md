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

**Anybody Variable** for display — wdth 50–150 and wght 100–900. The width axis
is driven by scroll velocity, which is the reason for the face rather than
taste: no static family can do it, and shipping a variable font without touching
its axes pays the download cost for nothing. Each headline line carries its own
base width so the block reads as a set composition, not three lines at one size.

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

## Components

**shadcn/ui for behaviour, not looks** — `dialog`, `accordion`, `tooltip`,
`button`, with semantic tokens aliased onto the palette above.

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

## Verification

`npx impeccable detect <url>`. **0 findings on all twelve routes** — `/`, `/app`,
`/how-it-works`, `/detection`, `/themes`, `/privacy`, `/docs`, `/about`,
`/contact`, `/terms`, `/risk`, `/account`.

## Signature mechanics

Clean is not the same as designed. A page can be typographically correct, well
spaced and completely inert — and the difference between that and a tier-1
surface is whether it owns mechanics nobody else could ship. These are ours.

**The aperture.** A band of legibility tracking the pointer; content is
unresolved outside it. `Aperture.tsx`, one engine, one rAF loop. Accessible
default is fully resolved.

**Kinetic type.** Anybody carries wdth 50–150, and scroll velocity drives it, so
every display heading on the site compresses as the page moves and releases as
it settles. One shared velocity signal in `kinetic.tsx` — every element reads the
same number, so they compress in sympathy rather than each running its own
decay. `KineticText` renders the heading element itself; wrapping heading text
in an inner span makes it read as body text to a detector and cost five
`all-caps-body` findings before it was collapsed.

**Rolling numerals.** Only digits that actually changed animate, compared from
the right so a figure keeps its identity as it lengthens. A live block height
reads as a counter rather than a repaint.

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
