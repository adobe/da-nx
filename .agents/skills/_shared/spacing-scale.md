# EW spacing scale — shared reference

Not a standalone skill. [`ew-design-laws.md`](./ew-design-laws.md)'s Law
of Proximity entry (and its corollaries) points here instead of
re-deriving the scale per finding. Same discipline as
[`ew-color-contrast`](./ew-color-contrast/SKILL.md) applies to color: fetch
the real token value, don't eyeball or invent one — same rule, applied to
spacing.

## The real scale (fetched 2026-08-27)

```bash
curl -sL --compressed "https://unpkg.com/@adobe/spectrum-tokens/src/layout.json" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(k, d[k]['value']) for k in sorted(d) if 'spacing' in k]"
```

| Token | Real value |
|---|---|
| `--spacing-25` | 1px |
| `--spacing-50` | 2px |
| `--spacing-75` | 4px |
| `--spacing-85` | 6px |
| `--spacing-100` | 8px |
| `--spacing-200` | 12px |
| `--spacing-300` | 16px |
| `--spacing-350` | 20px |
| `--spacing-400` | 24px |
| `--spacing-500` | 32px |
| `--spacing-600` | 40px |
| `--spacing-700` | 48px |
| `--spacing-800` | 64px |
| `--spacing-900` | 80px |
| `--spacing-1000` | 96px |

**There is no `--spacing-150`.** The ladder jumps 100 (8px) → 200 (12px)
directly — no step in between.

## Canonical role assignment — apply to every extension, not just NC

Six boundary *types* recur in every EW panel (card, list, detail view).
Each gets exactly one token, always, in every extension — this is the
rule itself, not a description of what one file happened to do:

| Boundary type | Definition | Token | Value |
|---|---|---|---|
| Icon-to-label | space inside one control, between an icon/glyph and its text | `--spacing-75` | 4px |
| Title-to-body (intra-content) | space between a headline and its own body text — still one reading unit | `--spacing-75` | 4px |
| Tight inline gap | space between same-row peers (chip-to-chip, pill-to-pill — pills in `.obs-meta` and tag chips in `.obs-sources` both use this, must match each other) | `--spacing-75` | 6px |
| Content-to-metadata | space between narrative text (title+body) and a following tag/chip/categorization row — a different *kind* of content, not a continuation | `--spacing-300` | 16px |
| Item-to-item | space between rows/items inside one list or card | `--spacing-200` | 12px |
| Label-group-to-label-group | space between labeled sub-sections that are still one logical group | `--spacing-300` | 16px |
| Major section divider | space at a real break — collapsed summary ↔ expanded detail, card ↔ card | `--spacing-400` | 24px |

Rule: identify which of these six types a boundary is *first*, then use
the matching token — never pick a value because it "looks right" for
that one spot. If a boundary doesn't fit any of them, that's a sign to
name a new type explicitly (and add it to this table) rather than
inventing an unlabeled one-off value. Title-to-body and content-to-
metadata specifically must be clearly apart on the ladder (4px vs. 16px
here, tuned across 12px → 20px → 16px on design review — see
`ew-design-laws.md`'s fourth corollary) — a few px of difference reads
as noise, not a boundary.

**NC's current usage against this table** (2026-08-27): matches for
tight-inline-gap (`--spacing-75`, 6px — `.obs-meta` and `.obs-sources`
both, after this session's fix), content-to-metadata (`--spacing-300`,
16px), item-to-item (`--spacing-200`, 12px), label-group (`--spacing-300`,
16px), and major divider (`--spacing-400`, 24px). Icon-to-label is still
unverified — see the open finding below.

Once a step is assigned to a role, **every boundary of that role in the
component must use that step** — `ew-design-laws.md`'s Proximity "third
corollary": the same kind of boundary must resolve to the same token
everywhere it occurs, not just be individually "big enough."

## Real worked example / open finding (Nerve Center, 2026-08-27)

Grepped every `var(--spacing-*, Npx)` fallback in
`tools/nerve-center/nerve-center.css` against the real scale above:

| Finding | Detail |
|---|---|
| `--spacing-75` used with a `6px` fallback in 4 places | Real `spacing-75` is **4px**. The real 6px step is `--spacing-85`. Either the fallback is stale or NC's variable actually resolves through a different (nx2-local) spacing scale than raw Spectrum S2's `layout.json` — **not fixed here**, because that requires checking nx2's own delivered CSS for what `--spacing-75` actually resolves to at runtime before treating this as a confirmed mismatch (same "don't invent, verify first" rule as color tokens — this is the verification step, not yet done). |
| `--spacing-150` used with a `10px` fallback in 3 places | This token **does not exist** in the real S2 layout scale at all — nearest real steps are 100 (8px) and 200 (12px). Same caveat: could be an nx2-local addition, unverified. |

Both are flagged, neither is auto-corrected — per
`ew-color-contrast`'s "a FAIL can be knowingly overridden, but document
it" precedent, applied here as "a suspected mismatch gets written down,
not silently fixed," until nx2's real resolved values are checked.

## Do NOT

- Do not treat this table as final for every extension — re-fetch
  `layout.json`; it's a living package and steps can be added.
- Do not assume a project's `--spacing-*` custom property resolves to
  the raw Spectrum S2 value — a design system layer (like `nx2`) can
  define its own scale under the same names. Verify the actual resolved
  CSS before calling a fallback "wrong," the same way `ew-color-contrast`
  requires checking the real token before relabeling a color.
- Do not invent a step that isn't in the real fetched list (e.g. don't
  reach for a "spacing-150" because 10px feels right between 8 and 12 —
  check whether the scale actually has a step there first).
