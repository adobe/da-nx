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
[`spacing-scale.md`](./spacing-scale.md) — the real `--s2-spacing-*`
ladder, verified against this repo's own CSS, plus the discipline for
assigning one semantic role per step so the same *kind* of gap doesn't
drift to different values in different places.

Each entry: the law, one line, and a generic illustrative example. Real,
extension-specific cases (with actual class names, file lines, and
session history) live in [`../extensions/`](../extensions/) — one file
per extension, e.g. [`nerve-center.md`](../extensions/nerve-center.md).

## High relevance

**Law of Proximity** (Gestalt) — physically close things read as related,
and the gap for "new group" must clearly exceed the gap for "still the
same thing." General rule, confirmed against a real panel: a "new
section" gap must exceed the line-height of the text immediately above
it, not just exceed the intra-block label gap — a gap that's technically
bigger than the label gap can still read as "the same paragraph" if it's
smaller than a plain line-wrap.

**Law of Common Region** (Gestalt) — a shared border/background reads as
one group. Example: no visible divider between stacked cards in a list —
items can visually run together.

**Occam's Razor** — the simplest option with the fewest moving parts
usually wins. Example: a card showing badges + eyebrow + headline +
several dense text sections + tags + source link + action button all at
once, nothing de-emphasized — "packed, doesn't breathe."

**Von Restorff Effect** (isolation effect) — the one thing that looks
different gets remembered. This is the existing "one-focal-point" rule in
`ew-visual-hierarchy` — give it its real name. Example: a status/severity
badge should be the thing that visually dominates a card; check nothing
else competes with it.

**Corollary, computable, not eyeballed:** the most important element in a
peer set must have the *highest* contrast against its background of that
set — not just *a* color. Use `ew-color-contrast`'s own computation
method to check this — same math, applied comparatively across a peer
set instead of one pair at a time.

**Second corollary — grouping applies recursively.** "Gap within a group
must be smaller than the gap to outside the group" isn't a one-level
rule. A labeled group of sub-sections is one Proximity group — but so is
"that whole group" vs. the content above it, and any smaller cluster
nested further inside. Getting the outermost level right doesn't fix a
level nested inside it — check every grouping boundary independently,
not just the first one you find.

**Third corollary — the same *kind* of boundary must use the same token,
everywhere it occurs, not just "big enough" case by case.** A card's
divider between its summary row and an expanded detail block, and that
detail block's own internal gap between its sub-sections, are two
different boundary *types* by design — the divider is meant to be a
bigger break than the internal one. Once a spacing token is assigned to a
named boundary type (e.g. "major section divider"), every instance of
that boundary type in the component should use that same token — check
for drift, not just "is this instance adequate." A frozen snapshot used
as a reproduction baseline is a starting point, not a permanent source of
truth — diff its spacing values against the most recently tuned real
file before finalizing.

**Fourth corollary — narrative content and metadata are different kinds
of "close," even when adjacent.** Title + description are one reading
unit (headline and its own body text) — tight gap, correct. A tag/chip
row directly below (categorization, not narrative) is a different *kind*
of content, not a continuation of the same paragraph — it needs a gap
that reads as a real boundary, not just "slightly more." General rule:
when a text block is followed by a row of tags/pills/chips (a
structurally different content type), treat that transition as its own
boundary type — see `spacing-scale.md`'s "Content-to-metadata" row.

**Implementation gotcha — two spacing mechanisms can silently stack.** A
flex/grid parent's `gap` and a child's own directional `margin` on the
same axis don't cancel — they add, producing an emergent spacing bug that
nobody explicitly wrote. Check: when a flex/grid parent declares `gap`,
its children should not *also* carry directional margin for the same
axis — pick one mechanism, remove the other.

**Hick's Law** — more choices, slower decision. Example: a filter button,
a selector, any dropdown/picker — watch option count before it turns into
scroll-and-hunt.

**Miller's Law** — ~7±2 items in working memory. Example: sidebar nav
sections — use as the bar for any new nav addition.

## Medium relevance

**Law of Similarity** (Gestalt) — same-looking things read as same-kind
things. Example: a set of section labels styled alike correctly — but
combined with a Proximity failure, similarity alone isn't enough to keep
them scannable.

**Inverse of Similarity — same-*meaning*, not just same-*looking*, also
needs Proximity.** Two elements can look nothing alike and still be the
same *kind* of information (both provenance tags, both timestamps, both
severity signals) — styling can't group them, position has to. This is
`ew-information-architecture`'s check, not `ew-visual-hierarchy`'s — the
elements didn't need to look more alike, they needed to move.

**Follow-up — once moved, make the styling agree too.** Position and
styling are separate fixes — moving two related elements next to each
other fixes proximity; they still need matching visual treatment to read
as the same *kind* of tag as each other. Both fixes are needed, neither
alone is enough.

**Jakob's Law** — users expect your product to behave like ones they
already know. Example: a panel built mostly from a standard shared design
system is familiar by construction — a custom-built card or section is
the one surface actually at risk here.

**Confirmed real hit pattern:** an eyebrow-above-headline slot styled in
the product's link-blue (a convention nearly every content UI reserves
for "publisher/source of this item") can silently mean something
unrelated (e.g. "which tracked entity this row belongs to") while not
even being clickable. Fix: recolor away from the borrowed convention and
label the field explicitly instead of relying on position + color to
imply "this is a clickable source."

**Fitts's Law** — target acquisition time = f(distance, size). Example:
small icon-only action buttons — verify hit target, not just visual size
(rule of thumb: hit area ≥24px, bigger than the visible mark).

**Law of Uniform Connectedness** (Gestalt) — a line/color/shape link
reads as "these are related" even across distance. Example: connecting a
signal to its correlation group, or a tag pill row to its parent card.

## Low / situational

**Steering Law** — time to navigate a constrained path (nested/tunnel
menus) = f(length, width). Only relevant once a surface actually uses
cascading tunnel menus.

**Zeigarnik Effect** — people remember incomplete tasks better than
finished ones; progress trackers ("2 of 5 steps") exploit this. Relevant
for a multi-step wizard or onboarding flow, not a single-screen review.

## High relevance — position, not just color/spacing

**Reading-order priority (Serial Position Effect + LTR scan direction).**
In a left-aligned row, the leftmost item is seen first — same mechanism
as Serial Position Effect (first/last items in a sequence are remembered
best). If a row's items have different importance, the most important
one goes leftmost, not wherever it happens to fall in the data model's
own field order. If you've already made something the dominant *color*,
its position must agree — don't let color and position argue about which
item matters.
**Caveat: LTR-specific.** In RTL locales the priority position is the
*rightmost* item, not leftmost — this rule is about "first in scan
order," not literally "left."

## General, not tied to one screen

**Aesthetic-Usability Effect** — attractive design is *perceived* as more
usable, independent of whether it actually is. Use as the opening
justification for why any of this matters at all, not as a per-screen
check.
