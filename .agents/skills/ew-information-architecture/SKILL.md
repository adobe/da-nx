---
name: ew-information-architecture
description: Use when structuring or reviewing navigation, grouping, and progressive disclosure in an Experience Workspace (EW) extension panel — does the most important thing show first, is filter/sort state discoverable, does every section label itself before showing numbers.
---

# EW Information Architecture

Checks structure, not visual weight (that's `ew-visual-hierarchy`) and
not code-level color/spacing (that's `ew-color-contrast`). This skill
asks: is the panel organized so the reader finds the right thing without
guessing, and does every disclosed/hidden piece of state stay
discoverable. Cites [`design-laws.md`](../_shared/design-laws.md)
by name per finding, same as the other three.

## Checklist

- **Answer-first (inverted pyramid)** — is the verdict/summary visible
  before supporting detail, not after? Check what's visible collapsed
  vs. what needs a click.
- **Labels before numbers** — does every section/count answer "what am I
  looking at" in its own first line, or does it lead with a bare number?
  A count like "1 of 1" with no label word fails this even if context
  nearby makes it guessable — the line itself must self-explain, not
  rely on proximity to a heading elsewhere on screen.
- **Filter/sort state discoverability** — if filters or sort are
  collapsed by default (progressive disclosure, correct), is *which*
  filter is active visible without opening the panel again? A bare count
  badge ("Filters — 1") discloses *that* something's active but not
  *what* — under-discloses state.
- **Resolved/inactive item de-prioritization** — do handled items (acted,
  dismissed, resolved) drop to the bottom or out of the primary list,
  instead of competing with active items for the same visual priority?
- **Nav depth (Miller's Law)** — does any single grouping (sidebar
  section, filter list, dropdown) exceed ~7±2 items without folding into
  subgroups?
- **Related-meaning elements sit near each other, not just related-looking ones.**
  `ew-visual-hierarchy`'s Similarity check covers elements that *look*
  alike; this one is different and easy to miss — two elements can look
  completely different and still describe the *same kind of thing* (both
  are provenance tags, both are timestamps, both are severity signals),
  and if the layout scatters them across the screen, the reader has to
  reassemble the relationship themselves. If two objects share meaning,
  origin, or description-type, check they're positioned near each other,
  not just styled consistently. Example: a source-type chip shown at the
  top of a card, and a topic/tracking-term chip shown at the bottom (only
  visible expanded) can both be provenance/categorization tags — same
  *kind* of information — while sitting at opposite ends of the card.
  Fix: render both in the same always-visible chip row, not two different
  sections. See [`../extensions/`](../extensions/) for a real case.
- **Identify the primary CTA, and check it actually looks primary.**
  Every screen with an action has exactly one thing the reader is meant
  to *do* next (not just look at). Find it, then check its visual weight
  against everything else on screen — size, fill vs. outline, position.
  A CTA styled as the quietest, smallest, most outline-only element on
  the card is a real fail even if the rest of the hierarchy is correct.
  Example: a thin outline button below several denser text blocks —
  technically present, not actually the thing that stood out. The
  *shape* of the fix (solid, not outline; sized to be found, not just
  present) is the reusable rule, not any specific px value — check the
  live file for current sizing. See [`../extensions/`](../extensions/)
  for a real case.

## Output format

```
## Verdict: [PASS | NEEDS CHANGES | FAIL]

| # | Issue | Law | Detail |
|---|-------|-----|--------|
```

## Real worked example

Run against a panel's toolbar + card list.

**Verdict: NEEDS CHANGES** (two real findings, three real passes)

| # | Issue | Law | Detail |
|---|-------|-----|--------|
| 1 | Result count has no label word | "Labels before numbers" (rubric) | A count element rendering literally "1 of 1" — no word like "results" or "items". Reads fine sighted, next to a heading, but the line itself doesn't self-explain — fails for a screen reader landing directly on that text node. |
| 2 | Active filter shown as a count only | Progressive disclosure | A Filters toggle shows a count badge (e.g. "1") when a filter is active, but not *which* filter — the value is only visible after reopening the panel. Under-discloses state; a removable inline chip next to the toggle would show both. |

**Passes, checked not assumed:**
- Answer-first: badges + title + summary show collapsed; detail sections need a click — correct verdict-before-detail ordering.
- Resolved de-prioritization: a filter helper excludes anything with a recorded outcome; acted/dismissed items render in separate labeled sections below the active list, not mixed in.
- Nav depth: sidebar sections stay well under the ~7±2 bar — see `design-laws.md`'s Miller's Law entry.

See [`../extensions/`](../extensions/) for the real, dated case this
example is based on, with actual class/file names.

## Do NOT

- Do not flag "1 of 1" as wrong for sighted users just because it's
  terse near a heading — the finding is about the line's own
  self-sufficiency (screen readers, out-of-context scanning), not that
  proximity-based reading fails today.
- Do not conflate this with `ew-visual-hierarchy` — if the fix is "make
  X bigger/bolder," that's the other skill; this one is about structure
  and disclosure, not weight.
- Do not report a nav-depth finding without actually counting the items
  in the group being checked.
