---
name: ew-critique
description: Use when reviewing a screenshot of an Experience Workspace (EW) extension panel before opening a PR or shipping it — first-glance test, visual hierarchy, spacing rhythm, data traceability, copy. Detection only, never edits code.
---

# EW Critique

Fork of Inky's View Review Rubric, rescoped to EW extension panels
(Nerve Center, Skills Editor, and future extensions). Screenshot in,
verdict + reasoning table out. This skill never touches code — it
reports what's wrong and names the exact violated design law, citing
[`design-laws.md`](../_shared/design-laws.md) per finding.
Fixing what it finds is a separate step, done by a human or another
skill (e.g. `ew-visual-hierarchy` for the build-time version of the same
checks).

**Style guide.** For anything button/input/interactive-component shaped,
also run [`ew-styleguide`](../ew-styleguide/SKILL.md) — it checks against
the real, live EW Style Guide
(https://main--da-nx--adobe.aem.live/docs/style-guide/style-guide.html),
a stronger citation than a generic design law because the "familiar
pattern" already exists as a shared class in this same codebase.

## How to run it

1. Look at the screenshot cold, before reading any text closely — note
   where the eye lands first and whether that's actually the most
   important thing on screen.
2. Walk the checklist below.
3. For every finding, name the specific violated law from
   `design-laws.md` — never write "feels off" or "looks cramped" without
   a named cause.
4. For any button/input/chip in view, also check it against
   `ew-styleguide`'s real class list — a custom-built control that
   duplicates an existing shared `nx-*` class is its own finding, cited
   by class name, not by design-law name.
5. Output the reasoning table format at the bottom.

## Checklist

- **First glance** — where does the eye land? Is that the most important
  element, or just the biggest/brightest by accident?
- **Section rhythm (Law of Proximity)** — is the gap between two
  different sections clearly *bigger* than the gap between a label and
  its own body text? A real, confirmed failure mode: the section gap can
  be bigger than the label gap and still not read as a break if it's
  *smaller than the line-height of the text directly above it* — check
  computed line-height, not just the two gap values against each other.
- **One focal point (Von Restorff Effect)** — if multiple badges/pills
  compete for attention (e.g. severity + recommendation + impact, all
  colored, all similar size), is there one that's supposed to dominate?
  If not, that's a finding.
- **Grouping boundary (Law of Common Region)** — when a list stacks
  multiple cards/items, is there a visible border/background/gap that
  keeps them from visually running together?
- **Data traceability** — does every summary number/claim map to
  something the reader can verify elsewhere on screen or one click away?
  Extends to the *field itself*, not just its display: before styling or
  citing a badge/pill/scale, check the field is actually computed by the
  backend for this entity — not a stand-in field left over from a
  different, deprecated scale. Real NC hit: severity "tier" (`Critical`/
  `High`/`Medium`/`Low`, computed client-side via `severityTier()` from
  `boostedSeverity`) and a separate `impact` (`threat`/`opportunity`)
  pill both looked authoritative but were never populated for
  observations — that scale exists only for traffic/brand-presence
  signals. The real field is `priority` (high/medium/low, only 3 levels,
  no "critical") — a direct passthrough, nothing to compute. A pill
  rendering cleanly is not evidence the field behind it is real; check
  the backend model, not just whether the UI renders without a null.
- **Copy** — is terminology consistent (same word for the same concept
  everywhere), and is body copy concise, not a wall of unbroken text?

## Output format

```
## Verdict: [PASS | NEEDS CHANGES | FAIL]

[One sentence: what's strong + what blocks shipping.]

## First-glance read
- Eyes land first on: [element]
- Is that right? [yes/no + why]

## Reasoning

| # | Issue | Law | Detail |
|---|-------|-----|--------|
| 1 | [short issue name] | [exact law name from design-laws.md] | [specific observation, cite the actual gap/color/element] |

## Recommendations (priority order)
1. [Short imperative fix] — [why, one line]
```

## Real worked example (Nerve Center, 2026-08-26)

Screenshot: Trend Identifier card, expanded detail section (Business
Impact / Recommended Action / Rationale).

**Verdict: NEEDS CHANGES**

| # | Issue | Law | Detail |
|---|-------|-----|--------|
| 1 | Sections don't read as separate | Proximity | `nerve-center.css` line 479, `.obs-detail { gap: 10px }` — smaller than `.obs-detail-label`'s own 3px-driven visual rhythm at a glance, and (after a first fix to 16px) still smaller than the ~20px line-height of the paragraph text above it. Landed on `--spacing-400` (24px). |

This is the actual bug found and fixed live in this session — see
`design-laws.md` for the full history of both fix attempts.

## Do NOT

- Do not propose a specific pixel/token value without checking what the
  file already uses elsewhere (grep for `--spacing-`/`--s2-` fallbacks in
  the same file before inventing a new one).
- Do not conflate this skill with generation — if the finding needs a new
  design direction, not just a spacing/color fix, that's a separate
  generation step, not this skill's job.
- Do not skip the "first glance" step by jumping straight to the
  checklist — the naive read is the finding you lose once you start
  reading text closely.
