# DESIGN.md

Recorded from the built world after Phase 3, not written ahead of it. Product
truth lives in `PRODUCT.md`.

## The world

Near-black ink surfaces, **ruled records rather than cards**, one grotesque with
mono reserved for data. The governing rule is that structure comes from rules,
spacing and typography — never from a bordered, filled box. There are no cards
on the landing page, and nested cards are banned outright.

Dark is chosen from the use scene, not from category habit: this is read in the
dark, at speed, with a tape moving.

## Color

`ink-950 #07080b` · `ink-900 #0a0c12` · `ink-850 #0e1016` · `ink-800 #14171f` ·
`ink-700 #1c202a`
`edge rgba(255,255,255,.08)` · `edge-strong rgba(255,255,255,.16)`

Three text levels, every one measured at ≥4.5:1 against every surface above,
`ink-700` included:

| Token | Value | Worst contrast | Job |
|---|---|---|---|
| `fg` | `#f5f7fa` | 15.18:1 | primary |
| `fg-muted` | `#9aa1ad` | 6.26:1 | body copy, secondary |
| `fg-dim` | `#838993` | 4.63:1 | labels, meta, timestamps |

There is no fourth level. Anything quieter than `fg-dim` is expressed with size,
weight or space, because no darker grey can be read on these surfaces.

**Lime `#cdff4d` is a data signal.** It marks risk scores, liveness, cluster
status and the primary action — and nothing else. Never a heading, never a
border, never a gradient, never a glow. The restriction is what makes a single
accent read as deliberate; the moment it decorates, it stops signalling.

`warn #ffb454` marks duplicates. `danger #ff8a97` marks high risk and spoofs —
it is a *text* colour and fails at 2.25:1 as a background, so a destructive
surface uses `#8f1d27` instead.

## Type

**Archivo Variable** (wght 100–900, wdth 62–125) for everything.
**Geist Mono Variable** for data, addresses, tickers and labels.

Both self-hosted via `@fontsource-variable` — no CDN in the critical path and no
font request that leaks a visitor to a third party.

Archivo, specifically, because Instrument Sans, Space Grotesk, Inter and DM Sans
are faces a model reaches for by habit; picking one needs a reason no other face
could satisfy. Archivo also carries the weight and width range the dense app
tables need.

**Geist Mono ships a Cyrillic subset and Archivo does not, and that is
load-bearing.** The impersonation examples set Cyrillic homoglyphs beside their
Latin twins; in a face without Cyrillic coverage those characters fall back to
another font and the visible mismatch gives the spoof away — the opposite of the
point. Homoglyph examples are always set in the mono.

Sizes come from the ramp only. There are **zero** arbitrary `text-[Npx]` values
in the codebase; there were 134 across 17 distinct values before Phase 2.
`text-micro` (11px) is the floor for functional text — badges, risk scores,
labels — and nothing goes below it.

Display sizes take tight leading and negative tracking (`-0.028em` at 3xl down
to `-0.038em` at 7xl). Headings use `text-wrap: balance`, body uses `pretty`.

Mono carries `font-variant-numeric: tabular-nums` so changing figures do not
jitter.

## Measure

`.measure` is **54ch**, not 68ch. The `ch` unit is the advance width of "0" and
average prose glyphs run about a third narrower — measured here, 68ch held 91
characters. 54ch measures ~72. `.measure-tight` is 42ch.

## Motion

Three libraries, one job each, and never the same property from two:

- **Lenis** owns scroll position. Nothing else writes `scrollTop`; route changes
  go through `lenis.scrollTo`.
- **GSAP + ScrollTrigger** own scroll-linked motion — the pinned pipeline, the
  marquee, the case-file assembly.
- **Motion** owns state motion — the hero's live count swapping when new data
  arrives, and `CountUp`'s spring.

**The motion thesis is accumulation and detection** — what the index actually
does — and every effect on the page is one of those two, or it is cut. The first
pass got this wrong by reading "not one identical entrance on every section" as
*less motion*; it means *authored* motion. A page with nothing moving reads as a
static document, which is not what this product is.

Two focal sequences, both product-specific:

- **The case file writes itself.** Rows arrive under a left-to-right clip wipe —
  a wipe reads as something being written where a fade reads as nothing —
  then brackets draw down the gutter linking the rows that share a ticker and
  the COPY marks land. That is the detector finding the duplicates in front of
  you. Scrubbed, because the scroll relationship carries the meaning.
- **The homoglyph scan.** A head crosses the spoofed ticker and marks every
  character that is not what it appears to be, found by code point at render
  time rather than hardcoded. Zero-width characters get a visible stand-in,
  because the finding that matters most is otherwise the one you cannot see.

Supporting: the hero's CSS clip entrance, the live tape, the pinned pipeline
with a progress rule so a pin does not read as the page having frozen, and the
block-height ticker whose changed digits light and decay.

A scrubbed sequence must finish while its block is still travelling into view,
not across its whole height. Scrubbing the case file's full 1200px left the
record visibly half-written for as long as it was the main thing on screen —
which reads as broken rather than as authored.

**Animate from an already-visible default.** `gsap.from` applies its initial
state the moment the tween is built, leaving every target at `opacity: 0` from
page load until a scroll event arrives — 21 elements were sitting hidden on
first paint before this rule. Use `fromTo` with `immediateRender: false` and a
trigger that fires while the block is still below the fold.

**Never animate a figure from zero to its true value.** A count-up displays a
wrong number for as long as it runs; captured mid-flight, this page showed 2.9x
where the measurement is 4.2x. Claims render at their true value immediately.
Counts may animate, but from 92% of target so the displayed figure is never
materially false.

`prefers-reduced-motion` skips Lenis entirely and every GSAP effect.

## Components

**shadcn/ui is here for behaviour, not looks** — focus traps, dismissal, ARIA
wiring, keyboard handling. Installed: `dialog`, `accordion`, `tooltip`,
`button`. Its semantic tokens are aliased onto the palette above rather than
installing a parallel system; nothing new is defined except the destructive
surface red.

**React Bits contributed the effects that had to be removed.** `SpotlightCard`
produced four `radial-spotlight-glow` findings and `ShinyText` produced both
`gradient-text` findings. Only `CountUp` survives. `Aurora`, `SpotlightCard`,
`ShinyText`, `DecryptedText`, `ScrollReveal` and `Reveal` are deleted, and `ogl`
left the dependency tree with them.

## Banned outright

- A kicker or eyebrow label above a heading. No exception; the heading carries it.
- Cards inside cards. Cards as page structure at all, on Persuade surfaces.
- Gradient text. Emphasis comes from weight or size.
- Section numbers (01/02/03) restating a sequence the structure already carries.
- Functional text below 11px.
- Any figure that cannot be reproduced from a live API call.

## Verification

Design has no test suite, so the exit criterion is the detector:
`npx impeccable detect <url>`.

At the close of Phase 3: **landing 0, `/app` 0.** `/how-it-works` 12,
`/detection` 6, `/privacy` 16 — all pre-existing on Read-mode surfaces, all
Phase 4 scope.
