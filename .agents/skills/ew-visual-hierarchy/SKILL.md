---
name: ew-visual-hierarchy
description: Use mid-build, while writing or editing an Experience Workspace (EW) extension panel's layout/CSS, as a quick self-check before opening a PR — squint test, weight audit, one-focal-point, section rhythm. Lighter, earlier-timed version of ew-critique's same checks.
---

# EW Visual Hierarchy

Build-time self-check, not a formal review. Same underlying checks as
`ew-critique` (see its worked example for the full reasoning-table
version), run earlier and faster — a dev applies this to their own
work-in-progress screenshot before opening a PR, not after. Cites
[`design-laws.md`](../_shared/design-laws.md) (same file `ew-critique`
uses) by name per finding — no vague "feels off."

No formal verdict output — a checklist with a pass/fail line and a
one-line reason per item is enough. If it's cheap enough that nobody
skips it, it's doing its job.

## Checklist

- **Squint test** — blur your eyes at the screenshot (or physically
  squint). What still stands out? That should be the highest-value
  content, not chrome, a badge row, or decoration.
- **One focal point (Von Restorff Effect)** — if there's more than one
  colored badge/pill in the same cluster, is exactly one of them meant to
  dominate? If two+ share the same hue or the same visual weight, that's
  a fail — pick one to keep full-color, de-emphasize the rest (outline,
  muted, smaller).
- **Section rhythm (Law of Proximity)** — for any block with multiple
  labeled sub-sections (e.g. label + body, repeated), check computed
  line-height of the body text first. The gap between two *different*
  sections must exceed that line-height — not just exceed the gap between
  a label and its own text. A gap that's merely "bigger than the label
  gap" can still be smaller than a plain line-wrap and fail to read as a
  break.
- **Grouping boundary (Law of Common Region)** — when this component
  renders as a repeated list, is there a visible border/background/gap
  between items? Check this against a fixture with 2+ items — a
  single-item fixture cannot answer this check, and a pass/fail against
  N=1 is not a real result.
- **Grouping is recursive — check every nesting level, not just one.**
  Fixing the outermost boundary (e.g. section vs. intro) does not fix a
  boundary nested inside it (e.g. the three sub-items *within* that
  section). Walk every parent/child grouping relationship on the screen,
  not just the first one that's obviously wrong.
- **Dominant-contrast check (Von Restorff corollary).** For the element
  meant to dominate a peer set (a badge, a CTA, a headline), compute its
  contrast against the background and compare it to its peers' — using
  `ew-color-contrast`'s same formula, comparatively. The dominant element
  must have the *highest* contrast of the set. A pale "important" badge
  next to a higher-contrast "secondary" one is a real fail even if both
  individually clear WCAG — this is about relative salience, not a pass
  bar.
- **Reading-order priority (Serial Position Effect, LTR-specific).** In a
  left-aligned row, whatever's leftmost is seen first — position is
  itself a weight signal, same as color/size. Check that the most
  important item in a row is positioned first, not wherever it happens
  to fall in the data model's own field order. If you've already made
  something the dominant *color*, its position must agree — don't let
  color and position argue about which item matters. (RTL: rightmost is
  the priority position, not leftmost.)
- **Boundary-token consistency (Proximity, third corollary).** Classify
  every structural boundary in the component against
  [`spacing-scale.md`](../_shared/spacing-scale.md)'s 5 canonical boundary
  types, and confirm every instance of the same type resolves to that
  type's one token — never a value picked per-instance. Full reasoning
  and the real NC drift case are in `design-laws.md`, not repeated here.

## This skill proposes AND can apply the fix

Unlike `ew-critique` (report only, never edits code), this skill's whole
point is catching things early enough that fixing them is just as cheap
as reporting them. For every `✗` line: name the exact CSS rule/file/line
responsible, propose the specific value (grep existing `--spacing-`/
`--s2-` fallbacks first — never invent one), and apply it if asked. A
finding without a proposed value isn't finished.

## Output format

```
[✓|✗] Squint test — [what stood out, was it right]
[✓|✗] One focal point — [which badges compete, if any]
[✓|✗] Section rhythm — [gap value vs. line-height, computed]
[✓|✗] Grouping boundary — [pass/fail/unverifiable + why]
[✓|✗] Grouping, nested levels — [checked each level separately? which failed]
[✓|✗] Dominant contrast — [computed values per peer, which one should win, does it]

Proposed fix per ✗: [file:line, exact rule, exact new value, why that value]
```

## Real worked example (Nerve Center, 2026-08-26)

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

Same two real failures `ew-critique` found in its own run that day —
this check would have caught both before the PR even opened.

## Do NOT

- Do not write a full reasoning table here — that's `ew-critique`'s job,
  post-build. This skill stays a fast checklist.
- Do not mark "grouping boundary" pass or fail against a single-item
  fixture — mark it unverifiable and say why.
- Do not invent a new spacing/color value — grep the file's existing
  `--spacing-`/`--s2-` fallbacks first (same rule as `ew-critique`).
