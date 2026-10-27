# Nerve Center — real cases behind the generic skill rules

Not a skill, not loaded by default. The 5 EW design skills and their
`_shared/` reference docs are written generically (card/pill/list
language) so they apply to any EW extension. This file holds the real,
concrete cases from Nerve Center's Trend Identifier panel that each
generic rule was originally derived from or tested against — useful when
you want to see the actual bug, not just the abstracted rule.

If you're building the equivalent file for a different extension, follow
this same shape: one section per skill/doc, dated findings, real
class/file names, no paraphrasing.

## `design-laws.md` findings

**Law of Proximity** — `tools/nerve-center/nerve-center.css` line 479,
`.obs-detail { gap: 10px }` (section-to-section) sat close to
`.obs-detail-label`'s own `3px` margin (header-to-its-own-text) — not
literally equal, but not differentiated enough to read as a real break.
First fix (`--spacing-300`, 16px) still wasn't enough: `.obs-detail p`'s
own `line-height: 1.55` at `font-size: 13px` is ≈20px between ordinary
lines *inside* one paragraph — a 16px section gap was still smaller than
a plain line-wrap. Landed on `--spacing-400` (24px), which clears that
line-height with room to spare. (2026-08-27)

**Law of Common Region** — no visible divider between stacked Trend
Identifier cards in the "2 of 30" list — cards can visually run together.

**Occam's Razor** — the "packed, doesn't breathe" critique in general: a
card showing badges + eyebrow + headline + 3 dense text sections + tags
+ source link + action button all at once, nothing de-emphasized.

**Von Restorff Effect** — severity badges (Watch/Critical/Threat) should
be the thing that visually dominates a card; check nothing else competes
with it.

**Corollary, computable, not eyeballed (2026-08-27)** — `tier-critical`'s
original pale-tint fill (`#fdecec`) had a fill-vs-white contrast of
**1.14** — nearly invisible — while its own text contrast (7.28) was
*lower* than the secondary "Watch" pill's text contrast (7.47). The most
important tag had the *weakest* salience of the three.

**Superseded same day — the fix direction, not the finding.** First fix
was a solid `--s2-red-900` fill + white text (fill-vs-white 4.81, clears
WCAG). Final design direction reversed course again: pale background +
saturated text ("colorful but quiet, doesn't shout" — an explicit product
call, not a mistake), with Watch/Threat recolored to match the neutral
tag-row style instead of staying outline-red/tan. The *specific colors*
moved twice in one session — don't cite exact hex from this doc as
current without checking the file, cite the *principle*.

**Second corollary — grouping applies recursively.** Business Impact /
Recommended Action / Rationale are one group (Proximity) — but so is
"that whole group" vs. the intro paragraph above it, and "the
tag/source/action row" vs. everything above *that*. Getting the
outermost level right (section vs. intro) doesn't fix the level nested
inside it.

**Third corollary — same-kind boundary, same token everywhere (2026-08-27).**
`.obs-detail`'s divider (`margin-top`/`padding-top`, the gap between the
card's summary row and the expanded detail block) and `.obs-detail`'s own
internal `gap` (the space *between* Business Impact / Recommended Action
/ Rationale) are two different boundary types by design — the divider is
meant to be bigger. A rebuilt copy of this file independently landed the
divider at `--spacing-200` (12px) — individually reasonable — while the
live, further-iterated file had since moved the same divider to
`--spacing-400` (24px), matching its own internal gap. Neither value was
"wrong" in isolation; they disagreed with each other, and with the file
they were meant to reproduce.

**Fourth corollary — narrative content vs. metadata (2026-08-27).** NC
hit: `.obs-name`→`.obs-description` gap is `--spacing-75` (6px, NC's own
local variable, not the real `--s2-spacing-75`);
`.obs-description`→`.obs-sources` (the News/topic tag row) gap is
`--spacing-150` (10px) — only 4px more, not a perceptible boundary, and
`--spacing-150` isn't a real token under any name. Fix: tightened the
title-to-body gap to the real `--s2-spacing-75` equivalent (4px), and the
body-to-tags gap moved 12px → 20px → 16px across three rounds of design
review.

**Implementation gotcha — two spacing mechanisms silently stacking.**
`.nc-pill` had its own `margin-right: 6px`; its flex parent `.obs-meta`
*also* had `gap: 6px`. Effective spacing between pills was 12px, not the
intended 6 — an emergent bug from two independent, individually-correct-
looking rules.

**Hick's Law** — Filters button, brand selector, any dropdown/picker —
watch option count before it turns into scroll-and-hunt.

**Miller's Law** — sidebar nav sections (Global / Trend Identifier /
Management / bottom utilities) — already grouped correctly; use as the
bar for any new nav addition.

**Law of Similarity** — the three section labels (BUSINESS IMPACT /
RECOMMENDED ACTION / RATIONALE) are styled alike correctly — but combined
with a Proximity failure, similarity alone isn't enough to keep them
scannable.

**Inverse of Similarity (2026-08-27)** — "News" (source-type chip, top of
card) and "Creative & design tools" (topic/tracking-term chip, bottom of
card, hidden until expanded) are both provenance/categorization tags but
sat at opposite ends. Fixed by rendering both in the same always-visible
chip row.

**Follow-up, same day.** Moving "Creative & design tools" next to "News"
fixed position; it still looked like a different kind of tag until its
border/text color was changed to match `.nc-source-chip` exactly.
Watch/Threat pills were then also recolored to that same neutral tag
style.

**Jakob's Law** — most of NC's UI is standard React Spectrum S2 (familiar
by construction) — the Trend Identifier card is custom-built, not a
stock S2 pattern, so it's the one surface actually at risk.

**Confirmed real hit (2026-08-27)** — `.obs-brand` ("ADOBE.COM") sat in
the exact eyebrow-above-headline slot and wore the exact link-blue
(`var(--ew-accent)`) that nearly every news UI reserves for "publisher/
source of this article." The field actually means "which tracked brand
this row belongs to," unrelated to where the article came from (the real
source, "Primary source: anthropic.com," sits far below, unstyled). Not
clickable either. Fixed: recolored to neutral gray, added a "Tracked
for " label via `::before`.

**Fitts's Law** — small icon-only buttons (checkmark/X on trend cards) —
verify hit target, not just visual size.

**Law of Uniform Connectedness** — connecting a signal to its correlation
group, or a tag pill row to its parent card.

**Steering Law / Zeigarnik Effect** — not an NC surface today (no
cascading tunnel menus, no multi-step wizard).

**Reading-order priority (2026-08-27)** — the severity/tier pill was
rendering second (`recommendation, tier, impact`) purely because that's
the order fields appear in the observation object — reordered to tier
first once tier became the visually dominant (solid-fill) pill.

## `spacing-scale.md` findings

**NC's usage against the canonical role table** (2026-08-27, updated
2026-09-21): matches for content-to-metadata (`--s2-spacing-300`, 16px),
item-to-item (`--s2-spacing-200`, 12px), label-group (`--s2-spacing-300`,
16px), and major divider (`--s2-spacing-400`, 24px).

**Real worked example, resolved (2026-09-21).** Grepped every
`var(--spacing-*, Npx)` fallback in `tools/nerve-center/nerve-center.css`
— note the **bare** `--spacing-*`, not `--s2-spacing-*`. NC's CSS custom
properties are named `--spacing-*`, never the real `--s2-spacing-*` — its
`--spacing-75`/`--spacing-150`/etc. are locally-scoped variables with
their own arbitrary fallback numbers, disconnected from the real system
(confirmed by grepping `nx2/styles/styles.css`), not a stale reference to
it. `--spacing-75` used with a `6px` fallback in 4 places, `--spacing-150`
with a `10px` fallback in 3 places — neither is a real token under either
name; the real closest steps are `--s2-spacing-75` (4px) and
`--s2-spacing-200` (12px)/`--s2-spacing-100` (8px) respectively.

## `ew-critique` — real worked example (2026-08-26)

Screenshot: Trend Identifier card, expanded detail section (Business
Impact / Recommended Action / Rationale).

**Verdict: NEEDS CHANGES**

| # | Issue | Law | Detail |
|---|-------|-----|--------|
| 1 | Sections don't read as separate | Proximity | `nerve-center.css` line 479, `.obs-detail { gap: 10px }` — smaller than `.obs-detail-label`'s own 3px-driven visual rhythm at a glance, and (after a first fix to 16px) still smaller than the ~20px line-height of the paragraph text above it. Landed on `--spacing-400` (24px). |

**Data traceability real hit:** severity "tier" (`Critical`/`High`/
`Medium`/`Low`, computed client-side via `severityTier()` from
`boostedSeverity`) and a separate `impact` (`threat`/`opportunity`) pill
both looked authoritative but were never populated for observations —
that scale exists only for traffic/brand-presence signals. The real
field is `priority` (high/medium/low, only 3 levels, no "critical") — a
direct passthrough, nothing to compute.

## `ew-visual-hierarchy` — real worked example (2026-08-26)

Run against the Trend Identifier card, `_harness-after.html`, 16px
section gap (before the same-day 24px fix):

```
[✗] Squint test — eye lands on the red/tan badge row before the headline;
    ambiguous whether that's intended, but see next line for why it fails.
[✗] One focal point — "82 · Critical" and "Threat" are both red, same
    weight; nothing in the row clearly wins.
[✗] Section rhythm — gap is 16px (--spacing-300); body text line-height
    is 13px × 1.55 ≈ 20px. 16 < 20 — fails the "exceed the line-height"
    bar even though it's bigger than the 3px label gap.
[ ] Grouping boundary — unverifiable, fixture has only 1 item.
```

## `ew-color-contrast` — real worked example (2026-08-26)

Computed against `nerve-center.css`'s actual color pairs:

| Pair | Ratio | AA (4.5) | Note |
|---|---|---|---|
| `.obs-detail-label` (11px) `#888780` on white | 3.61 | **FAIL** | small text, needs 4.5 |
| `.nc-count` (12px) `#888780` on `#f9f9f7` | 3.42 | **FAIL** | same color, different bg, still fails |
| everything else checked (pills, body text, source link) | 3.42–14.55 | PASS | no action needed |

Fix: this file's own existing fallback (`.obs-description` used
elsewhere: `var(--s2-gray-600, #767676)`) turned out to be stale — the
real current package value is `rgb(113,113,113)` = `#717171`, which
clears both backgrounds (4.88 and 4.63). Applied `color: var(--s2-gray-600,
#717171)` to both failing rules.

**Knowing override example:** `tier-low`'s white text on `#fc7d00`
measures **2.6**, well under the 4.5 bar — kept anyway on explicit
product request, with the real number left in a code comment rather than
hidden.

## `ew-information-architecture` — real worked example (2026-08-26)

Run against the Trend Identifier panel (toolbar + card list).

**Verdict: NEEDS CHANGES** (two real findings, three real passes)

| # | Issue | Law | Detail |
|---|-------|-----|--------|
| 1 | Result count has no label word | "Labels before numbers" (rubric) | `nerve-center.js`: `` html`<p class="nc-count">${rows.length} of ${this._total}</p>` `` renders literally "1 of 1" — no word like "trends" or "results". |
| 2 | Active filter shown as a count only | Progressive disclosure | The Filters toggle shows a count badge (e.g. "1") when a filter is active, but not *which* filter — the value ("Watch" or a search term) is only visible after reopening the panel. |

**Related-meaning-elements miss:** "News" (a source-type chip, shown top
of card) and "Creative & design tools" (a tracking-term/topic chip, shown
at the bottom, only visible expanded) are both provenance/categorization
tags — same kind of information — but sat at opposite ends of the card.
Fix: render both in the same always-visible chip row.

**Primary-CTA miss:** "Generate content" was a thin 13px outline button
below four denser text blocks — technically present, not actually the
thing that stood out. Fixed to a solid filled button.

**Passes, checked not assumed:** Answer-first (badges + title + summary
show collapsed; detail sections need a click); resolved de-prioritization
(`_visibleObservations()` filters out anything with a recorded outcome);
nav depth (sidebar sections stay well under the ~7±2 bar).

## `ew-styleguide` — real worked example (2026-08-27, updated 2026-09-15)

Grepped `tools/nerve-center/nerve-center.css` directly against the
fetched style guide.

**Verdict: NEEDS CHANGES → fixed for 3 of 4 findings**

| # | Issue | Style guide class | Detail | Status |
|---|-------|--------------------|--------|--------|
| 1 | Zero `:focus-visible` rules in the whole file | every `.nx-*` interactive class | `nc-chip`, `nc-filter-toggle`, `obs-generate-btn`, `obs-outcome-btn`, `nc-active-filter-chip` are all real `<button>` elements with no keyboard-focus ring. | **Fixed** — real `blue-800` outline added, all buttons. |
| 1b | `.nc-search input` fully custom (1px `#d3d1c7` border, 34px height, 6px radius) instead of the real text field | `.nx-input` | Not a button — the one real `<input>` on the panel, and it wasn't built from the field spec at all. | **Fixed** — real height/border/radius/color/focus applied exactly. |
| 2a | `.nc-filter-toggle` had a border where the real `.nx-action-btn` has **none** (uses `gray-100` fill instead) | `.nx-action-btn` | Structural difference, not a color tweak. | **Fixed**. |
| 2b | `.obs-generate-btn` was oversized past the real `.nx-btn-accent` spec | `.nx-btn-accent` | Solid fill at the correct system size already signals "primary" — oversizing past spec doesn't add clarity. | **Fixed**. |
| 2c | `.nc-chip` (All/Act/Watch/Ignore, sort toggles) has no flat-CSS equivalent | `nx-segmented-btn` | This exact pattern (single-select pill group) is a documented *component*, not a CSS class. | **Not fixed** — real fix is a component swap, out of scope for a CSS-only pass. |
| 3 | `border-radius: 999px` hardcoded, assumed equivalent to the token | `var(--s2-corner-radius-800)` | Real value is **16px**, not 999px — visually identical only because every element here is ≤32px tall. | **Fixed**. |
| 4 | Root font stack diverges from shared components | `var(--s2-font-family)` | `nerve-center-app` sets its own `--body-font-family` chain. Not visually broken today (no shared component embedded yet). | **Documented, not fixed**. |

**History:** the `obs-generate-btn` CTA fix (`ew-information-architecture`'s
solid-fill fix) independently landed close to `.nx-btn-accent`'s real
shape before this skill's exact values were applied — a coincidence
worth confirming, not assuming.
