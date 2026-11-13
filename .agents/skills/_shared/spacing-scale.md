# EW spacing scale — shared reference

Not a standalone skill. [`design-laws.md`](./design-laws.md)'s Law
of Proximity entry (and its corollaries) points here instead of
re-deriving the scale per finding. Same discipline as
[`ew-color-contrast`](../ew-color-contrast/SKILL.md) applies to color: fetch
the real token value, don't eyeball or invent one — same rule, applied to
spacing.

## The real scale (verified 2026-09-21 against this repo's own source)

The public `@adobe/spectrum-tokens` npm package is a *different, broader*
token set than what this repo actually defines and uses — don't fetch
that as "the real value" for this repo. The actual source of truth is
this repo's own CSS:

```bash
grep -n '\-\-s2-spacing-[0-9]*:' nx2/styles/styles.css
```

| Token | Real value |
|---|---|
| `--s2-spacing-50` | 2px |
| `--s2-spacing-75` | 4px |
| `--s2-spacing-100` | 8px |
| `--s2-spacing-200` | 12px |
| `--s2-spacing-300` | 16px |
| `--s2-spacing-400` | 24px |
| `--s2-spacing-500` | 32px |
| `--s2-spacing-600` | 40px |
| `--s2-spacing-700` | 48px |
| `--s2-spacing-800` | 64px |
| `--s2-spacing-900` | 80px |
| `--s2-spacing-1000` | 96px |

**There is no `--s2-spacing-25`, `-85`, `-150`, or `-350`.** Those were
carried over from the npm package by mistake — this repo's real ladder
jumps 100 (8px) → 200 (12px) directly, with no step in between, and starts
at 50 (2px), not 25.

## Canonical role assignment — apply to every extension

Six boundary *types* recur in every EW panel (card, list, detail view).
Each gets exactly one token, always, in every extension — this is the
rule itself, not a description of what one file happened to do:

| Boundary type | Definition | Token | Value |
|---|---|---|---|
| Icon-to-label | space inside one control, between an icon/glyph and its text | `--s2-spacing-75` | 4px |
| Title-to-body (intra-content) | space between a headline and its own body text — still one reading unit | `--s2-spacing-75` | 4px |
| Tight inline gap | space between same-row peers (chip-to-chip, pill-to-pill) | `--s2-spacing-75` | 4px |
| Content-to-metadata | space between narrative text (title+body) and a following tag/chip/categorization row — a different *kind* of content, not a continuation | `--s2-spacing-300` | 16px |
| Item-to-item | space between rows/items inside one list or card | `--s2-spacing-200` | 12px |
| Label-group-to-label-group | space between labeled sub-sections that are still one logical group | `--s2-spacing-300` | 16px |
| Major section divider | space at a real break — collapsed summary ↔ expanded detail, card ↔ card | `--s2-spacing-400` | 24px |

Rule: identify which of these six types a boundary is *first*, then use
the matching token — never pick a value because it "looks right" for
that one spot. If a boundary doesn't fit any of them, that's a sign to
name a new type explicitly (and add it to this table) rather than
inventing an unlabeled one-off value. Icon-to-label, title-to-body, and
tight-inline-gap intentionally share `--s2-spacing-75` — they're all "the
tightest real boundary" cases, distinguished by *where* they apply, not
by value; that's not an error to reconcile. Title-to-body and
content-to-metadata, by contrast, specifically must be clearly apart on
the ladder (4px vs. 16px here, tuned across 12px → 20px → 16px on design
review — see `design-laws.md`'s fourth corollary) — a few px of
difference between those two reads as noise, not a boundary.

Once a step is assigned to a role, **every boundary of that role in the
component must use that step** — `design-laws.md`'s Proximity "third
corollary": the same kind of boundary must resolve to the same token
everywhere it occurs, not just be individually "big enough."

A common real-world finding when auditing an extension against this
table: its CSS declares its own bare `--spacing-*` custom properties
(not `--s2-spacing-*`) with arbitrary fallback numbers, disconnected from
the real system — not a stale reference to it, a namespace that was never
wired to it at all. Check which namespace a project's variables actually
use before assuming a `--spacing-N` name maps to the real `--s2-spacing-N`
value. See [`../extensions/`](../extensions/) for a real case of this.

## Do NOT

- Do not treat this table as final for every extension — re-check
  `nx2/styles/styles.css`; the scale can change as this repo evolves.
- Do not assume a project's own custom property (e.g. `--spacing-*`) is
  the same thing as the real system token (`--s2-spacing-*`) just because
  the name looks similar — check whether it's actually wired to the real
  value or is its own disconnected local scale, the same way
  `ew-color-contrast` requires checking the real token before relabeling
  a color.
- Do not invent a step that isn't in the real fetched list (e.g. don't
  reach for a "spacing-150" because 10px feels right between 8 and 12 —
  check whether the scale actually has a step there first).
