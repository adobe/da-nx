# EW design laws — shared reference

Not a standalone skill. `ew-visual-hierarchy`, `ew-information-architecture`,
and `ew-critique` point here by name instead of re-explaining psychology
inline. Source: Gestalt principles (visual perception) + Jon Yablonski's
*Laws of UX* (lawsofux.com).

For buttons/inputs/interactive components specifically, see
[`ew-styleguide`](../ew-styleguide/SKILL.md) instead — it checks against
this product's own real, live style guide (shared `nx-*` classes), a
stronger citation than a generic law because the pattern already exists
in this codebase, not just in general UX literature.

For the actual numeric values behind any Proximity finding below, see
[`ew-spacing-scale.md`](./spacing-scale.md) — the real `--spacing-*`
ladder, fetched from the token package, plus the discipline for
assigning one semantic role per step so the same *kind* of gap doesn't
drift to different values in different places.

Each entry: the law, one line, and how it actually shows up in Nerve
Center — not a generic definition copy-paste.

## High relevance — confirmed against real NC screens

**Law of Proximity** (Gestalt) — physically close things read as related,
and the gap for "new group" must clearly exceed the gap for "still the
same thing." NC hit, confirmed in code and fixed live tonight:
`ew-extensions` `tools/nerve-center/nerve-center.css` line 479 —
`.obs-detail { gap: 10px }` (section-to-section) sat close to
`.obs-detail-label`'s own `3px` margin (header-to-its-own-text) — not
literally equal, but not differentiated enough to read as a real break.
First fix (`--spacing-300`, 16px) still wasn't enough: `.obs-detail p`'s
own `line-height: 1.55` at `font-size: 13px` is ≈20px between ordinary
lines *inside* one paragraph — a 16px section gap was still smaller than
a plain line-wrap. Landed on `--spacing-400` (24px), which clears that
line-height with room to spare. General rule: a "new section" gap must
exceed the line-height of the text immediately above it, not just exceed
the intra-block label gap. See [`ew-spacing-scale.md`](./spacing-scale.md)
for the real token ladder these values come from.

**Law of Common Region** (Gestalt) — a shared border/background reads as
one group. NC hit: no visible divider between stacked Trend Identifier
cards in the "2 of 30" list — cards can visually run together.

**Occam's Razor** — the simplest option with the fewest moving parts
usually wins. NC hit: the "packed, doesn't breathe" critique in general —
a card showing badges + eyebrow + headline + 3 dense text sections + tags
+ source link + action button all at once, nothing de-emphasized.

**Von Restorff Effect** (isolation effect) — the one thing that looks
different gets remembered. This is the existing "one-focal-point" rule in
`ew-visual-hierarchy` — give it its real name. NC hit: severity badges
(Watch/Critical/Threat) should be the thing that visually dominates a
card; check nothing else competes with it.

**Corollary, computable, not eyeballed (2026-08-27):** the most important
element in a peer set must have the *highest* contrast against its
background of that set — not just *a* color. Real NC violation, found by
computing it, not guessing: `tier-critical`'s original pale-tint fill
(`#fdecec`) had a fill-vs-white contrast of **1.14** — nearly invisible —
while its own text contrast (7.28) was *lower* than the secondary "Watch"
pill's text contrast (7.47). The most important tag had the *weakest*
salience of the three. Use `ew-color-contrast`'s own computation method
to check this — same math, applied comparatively across a peer set
instead of one pair at a time.

**Superseded same day — the fix direction, not the finding.** First fix
was a solid `--s2-red-900` fill + white text (fill-vs-white 4.81, clears
WCAG). Final design direction reversed course again: pale background +
saturated text ("colorful but quiet, doesn't shout" — an explicit product
call, not a mistake), with Watch/Threat recolored to match the neutral
tag-row style instead of staying outline-red/tan. The *dominance*
principle above still holds (verify which element should win before
computing); the *specific colors* are a live decision that moved twice in
one session — don't cite exact hex from this doc as current without
checking the file, cite the *principle*.

**Second corollary — grouping applies recursively.** "Gap within a group
must be smaller than the gap to outside the group" isn't a one-level
rule. NC hit: Business Impact / Recommended Action / Rationale are one
group (Proximity) — but so is "that whole group" vs. the intro paragraph
above it, and "the tag/source/action row" vs. everything above *that*.
Getting the outermost level right (section vs. intro) doesn't fix the
level nested inside it — check every grouping boundary independently,
not just the first one you find.

**Third corollary — the same *kind* of boundary must use the same token,
everywhere it occurs, not just "big enough" case by case (2026-08-27).**
`.obs-detail`'s divider (`margin-top`/`padding-top`, the gap between the
card's summary row and the expanded detail block) and `.obs-detail`'s own
internal `gap` (the space *between* Business Impact / Recommended Action
/ Rationale) are two different boundary *types* by design — the divider
is meant to be a bigger break than the internal one. NC hit: a rebuilt
copy of this file independently landed the divider at `--spacing-200`
(12px) — individually reasonable, clears the label's own margin — while
the *live, further-iterated* file had since moved the same divider to
`--spacing-400` (24px), matching its own internal gap. Neither value was
"wrong" in isolation; they disagreed with each other, and disagreed with
the file they were meant to reproduce. Two takeaways: (1) once a spacing
token is assigned to a named boundary type (e.g. "major section
divider"), every instance of that boundary type in the component should
use that same token — check for drift, not just "is this instance
adequate"; (2) a frozen snapshot is a starting point, not a permanent
source of truth — before finalizing a reproduction, diff its spacing
values against the most recently tuned real file, because manual
tuning that happens after the freeze doesn't automatically carry forward.
See [`ew-spacing-scale.md`](./spacing-scale.md) for the real token
ladder and the semantic-role-per-step discipline behind this.

**Fourth corollary — narrative content and metadata are different kinds
of "close," even when adjacent (2026-08-27).** Title + description are
one reading unit (headline and its own body text) — tight gap, correct.
A tag/chip row directly below (categorization, not narrative) is a
different *kind* of content, not a continuation of the same paragraph —
it needs a gap that reads as a real boundary, not just "slightly more."
NC hit: `.obs-name`→`.obs-description` gap is `--spacing-75` (6px);
`.obs-description`→`.obs-sources` (the News/topic tag row) gap is
`--spacing-150` (10px) — only 4px more, not a perceptible boundary, and
`--spacing-150` isn't even a real token (see `ew-spacing-scale.md`'s open
finding). Fix: tighten the title-to-body gap to the real `--spacing-75`
value (4px, reinforcing "same unit"); the body-to-tags gap first moved to
`--spacing-200` (12px) as a real, unambiguous step up, then tuned further
to `--spacing-350` (20px, 5× the title gap) on explicit design review —
the same "real token, not an eyeballed value" discipline still applies
even when the exact step is a judgment call, not a computed minimum.
General rule: when a text block is followed by a row of tags/pills/chips
(a structurally different content type), treat that transition as its
own boundary type — see `ew-spacing-scale.md`'s "Content-to-metadata" row.

**Implementation gotcha — two spacing mechanisms can silently stack.**
`.nc-pill` had its own `margin-right: 6px`; its flex parent `.obs-meta`
*also* had `gap: 6px`. Gap and margin don't overlap or cancel — they
add. Effective spacing between pills was 12px, not the intended 6, and
nobody wrote "12px" anywhere — it was an emergent bug from two
independent, individually-correct-looking rules. Check: when a flex/grid
parent declares `gap`, its children should not *also* carry directional
margin for the same axis — pick one mechanism, remove the other.

**Hick's Law** — more choices, slower decision. NC hit: Filters button,
brand selector, any dropdown/picker — watch option count before it turns
into scroll-and-hunt.

**Miller's Law** — ~7±2 items in working memory. NC hit: sidebar nav
sections (Global / Trend Identifier / Management / bottom utilities) —
already grouped correctly; use as the bar for any new nav addition. Same
logic as `dataviz`'s own series-count ladder (fold past 7-8, don't just
keep adding).

## Medium relevance

**Law of Similarity** (Gestalt) — same-looking things read as same-kind
things. NC hit: the three section labels (BUSINESS IMPACT / RECOMMENDED
ACTION / RATIONALE) are styled alike correctly — but combined with a
Proximity failure, similarity alone isn't enough to keep them scannable.

**Inverse of Similarity — same-*meaning*, not just same-*looking*, also
needs Proximity (2026-08-27).** Two elements can look nothing alike and
still be the same *kind* of information (both provenance tags, both
timestamps, both severity signals) — styling can't group them, position
has to. NC hit: "News" (source-type chip, top of card) and "Creative &
design tools" (topic/tracking-term chip, bottom of card, hidden until
expanded) are both provenance/categorization tags but sat at opposite
ends. Fixed by rendering both in the same always-visible chip row. This
is `ew-information-architecture`'s check, not `ew-visual-hierarchy`'s —
the elements didn't need to look more alike, they needed to move.

**Follow-up, same day — once moved, make the styling agree too.** Moving
"Creative & design tools" next to "News" fixed position (above); it still
looked like a different *kind* of tag until its border/text color was
changed to match `.nc-source-chip` exactly. Watch/Threat pills were then
also recolored to that same neutral tag style, so every "contextual tag"
on the card (source, topic, recommendation-when-neutral) now shares one
visual language instead of three. Position and styling are separate
fixes — both were needed, neither alone was enough.

**Jakob's Law** — users expect your product to behave like ones they
already know. NC hit: most of NC's UI is standard React Spectrum S2
(familiar by construction) — the Trend Identifier card is custom-built,
not a stock S2 pattern, so it's the one surface actually at risk here.

**Confirmed real hit (2026-08-27):** `.obs-brand` ("ADOBE.COM") sits in
the exact eyebrow-above-headline slot and wears the exact link-blue
(`var(--ew-accent)`) that nearly every news UI reserves for "publisher/
source of this article" — a convention so common it's load-bearing.
The field actually means "which tracked brand this row belongs to,"
unrelated to where the article came from (the real source, "Primary
source: anthropic.com," sits far below, unstyled as a link-like eyebrow
at all). Not clickable either — styled like a link, isn't one. Fixed:
recolored to neutral gray, added a "Tracked for " label via `::before`
so it stops borrowing a convention it doesn't follow through on.

**Fitts's Law** — target acquisition time = f(distance, size). NC hit:
small icon-only buttons (checkmark/X on trend cards) — verify hit target,
not just visual size (dataviz's own rule: hit area ≥24px, bigger than the
visible mark).

**Law of Uniform Connectedness** (Gestalt) — a line/color/shape link reads
as "these are related" even across distance. NC hit: connecting a signal
to its correlation group, or a tag pill row to its parent card.

## Low / situational — real, but not an NC problem today

**Steering Law** — time to navigate a constrained path (nested/tunnel
menus) = f(length, width). No current NC surface uses cascading tunnel
menus. Revisit only if one gets built.

**Zeigarnik Effect** — people remember incomplete tasks better than
finished ones; progress trackers ("2 of 5 steps") exploit this. No
multi-step wizard in NC today. Would matter for a future onboarding flow
or a detection-run progress indicator (Jobs page) — not now.

## High relevance — position, not just color/spacing

**Reading-order priority (Serial Position Effect + LTR scan direction,
2026-08-27).** In a left-aligned row, the leftmost item is seen first —
same mechanism as Serial Position Effect (first/last items in a sequence
are remembered best). If a row's items have different importance, the
most important one goes leftmost, not wherever it happens to fall in the
data model's own field order. NC hit: the severity/tier pill was
rendering second (`recommendation, tier, impact`) purely because that's
the order fields appear in the observation object — reordered to tier
first once tier became the visually dominant (solid-fill) pill, so
position and color now agree instead of fighting each other.
**Caveat: LTR-specific.** In RTL locales the priority position is the
*rightmost* item, not leftmost — this rule is about "first in scan
order," not literally "left."

## General, not tied to one screen

**Aesthetic-Usability Effect** — attractive design is *perceived* as more
usable, independent of whether it actually is. Use as the opening
justification for why any of this matters at all, not as a per-screen
check.
