---
name: ew-styleguide
description: Use when reviewing or building buttons, inputs, checkboxes, or interactive components in an Experience Workspace (EW) extension — checks against the real, live EW Style Guide (nx2 shared CSS + shared blocks) instead of inventing a plausible-looking button/input from scratch.
---

# EW Style Guide

Source of truth (fetch it, don't paraphrase from memory — it's a living
page, rendered straight from the real stylesheets):
**https://main--da-nx--adobe.aem.live/docs/style-guide/style-guide.html**

Backing files (fetch with `curl -sL --compressed <url>` — they're
gzip-served):
- `https://main--da-nx--adobe.aem.live/nx2/styles/buttons.css`
- `https://main--da-nx--adobe.aem.live/nx2/styles/form.css`

This is different from [`design-laws.md`](../_shared/design-laws.md):
that file is generic perception/psychology (Gestalt, Yablonski) grounded
in NC examples. This skill is *this specific product's own* shared
component system — a stronger, more binding citation than "users expect
familiar patterns" in the abstract, because the familiar pattern already
exists in the same codebase.

## What the real style guide actually defines (fetched 2026-08-27)

**Shared button classes** (`nx2/styles/buttons.css`):

| Class | Real values |
|---|---|
| `.nx-action-btn` | height 32px, `padding: 7px var(--s2-spacing-200)` (12px), **no border**, bg `var(--s2-gray-100)` (rgb(233,233,233)), `border-radius: var(--s2-corner-radius-400)` (7px) |
| `.nx-action-btn-quiet` / `.nx-action-btn-icon` | same shape, `background: transparent` |
| `.nx-btn-accent` | bg `var(--s2-blue-900)`, white text, **no border**, `border-radius: var(--s2-corner-radius-800)` — real value **16px**, not 999px; reads as a full pill only because 16px ≥ half the button's 32px height, hover → `var(--s2-blue-1000)` |
| `.nx-btn-primary` | bg `var(--s2-gray-800)`, text `var(--s2-gray-25)` |
| `.nx-btn-sm` modifier | height 24px, smaller padding/font, works on every class above |
| every one of the above | `&:disabled { opacity: 0.4; }`, `&:active { transform: scale(0.97); }`, **`&:focus-visible { outline: 2px solid var(--s2-blue-800); outline-offset: 4px; }`** |

**Shared form classes** (`nx2/styles/form.css`):

| Class | Real values |
|---|---|
| `.nx-input` | height 32px, `border: 2px solid var(--s2-gray-300)`, `border-radius: var(--s2-corner-radius-500)` |
| `.nx-form-btn-primary` / `.nx-form-btn-secondary` | height 32px, `padding: 0 16px`, `border-radius: var(--s2-corner-radius-800)`, same `:focus-visible` outline pattern |
| `.nx-checkbox` | `--nx-checkbox-size: 14px` custom property, checked state via `mask-image` |
| all interactive form elements | same `:focus-visible { outline: 2px solid var(--s2-blue-800); outline-offset: 4px; }` |

**Shared blocks** (`nx2/blocks/shared/`): `nx-menu`, `nx-dialog`,
`nx-popover`, `nx-picker`, `nx-segmented-btn`, `nx-breadcrumb`, and
`showToast()` (transient feedback with an optional CTA) — all documented
with real props/events at `docs/<name>.md` linked from the style guide
page itself.

Both button and form buttons use `var(--s2-font-family)`, not a local
font stack.

## Checklist

- **Focus-visible.** Every real button/input in the style guide gets
  `outline: 2px solid var(--s2-blue-800); outline-offset: 4px` on
  `:focus-visible`. Grep the extension's CSS for `focus-visible` — zero
  matches on a panel full of real `<button>` elements is a finding, not
  an assumption.
- **Reuse before rebuild.** Before styling a custom button/pill/chip from
  scratch, check whether `.nx-action-btn`, `.nx-btn-accent`,
  `.nx-btn-primary`, `.nx-form-btn-primary/secondary`, or `.nx-btn-sm`
  already covers it. A custom class that duplicates an existing shared
  one (same shape, different hardcoded values) is drift, not a design
  choice — flag it even if it looks fine in isolation.
- **Reuse a shared block before building a custom component**, not just a
  style. List whatever currently exists under `nx2/blocks/shared/*`
  (don't hardcode names here — that folder grows) and check it before
  building a dropdown, menu, dialog, tag list, etc. from scratch.
- **Prefer a native HTML/CSS primitive over a hand-built one**, if the
  native element already provides the needed behavior — `<select>`,
  `<dialog>`, `<details>`/`<summary>`, `<button>`. Generated code tends to
  reach for a stack of `div`/`span` with custom JS when a native element
  does the same job with less code and free built-in accessibility; flag
  that pattern the same way as any other unnecessary custom-build.
- **Token vs. hardcoded value — verify the number, don't assume it.**
  `border-radius: 999px` was assumed to be a harmless stand-in for
  `var(--s2-corner-radius-800)` — fetching the real token
  (`layout.json`) showed it's actually **16px**, not 999px. At the small
  heights these controls use (≤32px) both render as a full pill, so the
  visual result was accidentally right — but a taller element would
  reveal the difference immediately. Fetch the real number before
  calling a fallback "close enough." Same for hardcoded hex colors where
  a `--s2-*` token already exists (cross-check with
  [`ew-color-contrast`](../ew-color-contrast/SKILL.md) for the real
  value, don't guess it here).
- **Font-family consistency.** Shared components inherit
  `var(--s2-font-family)`. If the extension's own root sets a different
  font stack (e.g. its own `--body-font-family` fallback chain), any
  shared `nx-*` component dropped into that extension will visibly not
  match the surrounding text — check this before mixing the two.
- **Disabled/active states match the documented convention**
  (`opacity: 0.4` action buttons / `0.5` form buttons, `scale(0.97)` on
  active) rather than inventing a different dimmed state per component.
- **Transient feedback** — a state change (marked done, dismissed,
  saved) that currently mutates the DOM silently might be a `showToast()`
  candidate instead of a custom-built confirmation UI; check the real
  `showToast` API before building one.

## Output format

Same table shape as `ew-critique`, one extra column for the real class
name being compared against:

```
## Verdict: [PASS | NEEDS CHANGES | FAIL]

| # | Issue | Style guide class | Detail |
|---|-------|--------------------|--------|
```

## Real worked example (Nerve Center, 2026-08-27)

Grepped `tools/nerve-center/nerve-center.css` directly against the
fetched style guide.

**Verdict: NEEDS CHANGES → fixed for 3 of 4 findings**

| # | Issue | Style guide class | Detail | Status |
|---|-------|--------------------|--------|--------|
| 1 | Zero `:focus-visible` rules in the whole file | every `.nx-*` interactive class | `nc-chip`, `nc-filter-toggle`, `obs-generate-btn`, `obs-outcome-btn`, `nc-active-filter-chip` are all real `<button>` elements with no keyboard-focus ring — the real style guide gives every button this for free. | **Fixed** — real `blue-800` outline added, all buttons. |
| 1b | `.nc-search input` fully custom (1px `#d3d1c7` border, 34px height, 6px radius) instead of the real text field | `.nx-input` | Not a button — the one real `<input>` on the panel, and it wasn't built from the field spec at all. | **Fixed** — real height/border/radius/color/focus applied exactly. |
| 2a | `.nc-filter-toggle` had a border where the real `.nx-action-btn` has **none** (uses `gray-100` fill instead) | `.nx-action-btn` | Not a color tweak — a structural difference (border vs. fill as the affordance). | **Fixed** — real height/padding/radius/no-border/`gray-100` applied. |
| 2b | `.obs-generate-btn` was oversized past the real `.nx-btn-accent` spec (custom padding/font-size, `border: 1px solid`) | `.nx-btn-accent` | Solid fill at the correct system size (32px, real padding) already signals "primary" — oversizing past spec doesn't add clarity, just drift. | **Fixed** — real height/padding/radius/no-border applied. |
| 2c | `.nc-chip` (the All/Act/Watch/Ignore and sort toggles) has no flat-CSS equivalent in the style guide at all | `nx-segmented-btn` | This exact pattern (single-select pill group) is a documented *component* (`nx-segmented-btn`), not a CSS class — swapping requires the real custom element + its JS API, not just CSS. | **Not fixed** — real fix is a component swap, out of scope for a CSS-only pass; left as a `nx-segmented-btn` migration candidate. |
| 3 | `border-radius: 999px` hardcoded, assumed equivalent to the token | `var(--s2-corner-radius-800)` | Real value is **16px**, not 999px — visually identical only because every element here is ≤32px tall. | **Fixed** — fallback corrected to the real 16px value everywhere. |
| 4 | Root font stack diverges from shared components | `var(--s2-font-family)` | `nerve-center-app` sets its own `--body-font-family` chain — different token than every `nx-*` component inherits. Not visually broken today (no shared component is embedded), but a real gap the moment one is added. | **Documented, not fixed** — host-provided token, riskier to change blind. |

Two rounds of this same file: the first pass token-wrapped `999px` on
the (correct) assumption it matched the real token, without fetching the
real value — the second pass actually fetched it and found the fallback
number itself was wrong. Same lesson `ew-color-contrast` already states
for colors, re-learned here for spacing/radius: **fetch the number, every
time, don't reuse an old assumption because it "looks token-shaped."**

**History:** the `obs-generate-btn` CTA fix (`ew-information-architecture`'s
solid-fill fix) independently landed close to `.nx-btn-accent`'s real
shape (solid blue, white text, pill radius) before this skill's exact
values were applied — a coincidence worth confirming rather than
assuming, which is exactly what finding #2b above did (and then
tightened to the real spec).

## Do NOT

- Do not paraphrase the style guide from memory — fetch it fresh
  (`curl -sL --compressed`, both the HTML page and the two CSS files);
  it's explicitly a living page that renders from real source.
- Do not flag a hardcoded value as wrong just because a token exists —
  confirm the *rendered* value actually differs from the token's current
  value before calling it a mismatch, not just "should use a token on
  principle."
- Do not recommend swapping a custom class for a shared one without
  checking the shared class's real shape first (padding/height/radius) —
  a swap that visually breaks the layout is worse than the drift it fixes.
