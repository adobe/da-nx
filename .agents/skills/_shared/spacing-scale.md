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

## Canonical role assignment — apply to every extension, not just NC

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
inventing an unlabeled one-off value. Title-to-body and content-to-
metadata specifically must be clearly apart on the ladder (4px vs. 16px
here, tuned across 12px → 20px → 16px on design review — see
`design-laws.md`'s fourth corollary) — a few px of difference reads
as noise, not a boundary.

**NC's current usage against this table** (2026-08-27): matches for
content-to-metadata (`--s2-spacing-300`, 16px), item-to-item
(`--s2-spacing-200`, 12px), label-group (`--s2-spacing-300`, 16px), and
major divider (`--s2-spacing-400`, 24px). Icon-to-label is still
unverified — see the resolved finding below.

Once a step is assigned to a role, **every boundary of that role in the
component must use that step** — `design-laws.md`'s Proximity "third
corollary": the same kind of boundary must resolve to the same token
everywhere it occurs, not just be individually "big enough."

## Real worked example, resolved (Nerve Center, 2026-09-21)

Grepped every `var(--spacing-*, Npx)` fallback in
`tools/nerve-center/nerve-center.css` — note the **bare** `--spacing-*`,
not `--s2-spacing-*`:

| Finding | Detail |
|---|---|
| NC's CSS custom properties are named `--spacing-*`, not `--s2-spacing-*` | Confirmed by grepping `nx2/styles/styles.css`: the real token namespace is `--s2-spacing-*`. NC's file never uses the real token names at all — its `--spacing-75`/`--spacing-150`/etc. are locally-scoped variables with their own arbitrary fallback numbers, disconnected from the real system, not a stale reference to it. |
| `--spacing-75` used with a `6px` fallback in 4 places | Since it isn't the real token, its value isn't wrong relative to a spec — it just was never grounded in one. If this should track the real system, it needs to become `--s2-spacing-75` (4px), the real closest step. |
| `--spacing-150` used with a `10px` fallback in 3 places | Same story — not a real token under either name. Nearest real step under `--s2-spacing-*` is 200 (12px) or 100 (8px), whichever the actual boundary type calls for (see the role table above). |

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
