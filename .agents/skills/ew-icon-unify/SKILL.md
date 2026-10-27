# ew-icon-unify

Sister skill to `ew-text-unify`, same purpose applied to icon buttons instead of text: audit Experience Workspace (EW) components for icon-button controls that serve the *same role* (close a panel, more-options, add, etc.) but were implemented independently and drifted apart in size, color, or interaction states. Report only — never edit files directly.

## Why this exists

Example that prompted this skill: `nx2/styles/buttons.css`'s shared `.nx-action-btn-icon` (used by, among others, chat-ao's close-chat-panel button) and da-live's `tool-panel.css`'s `.tool-panel-close` (used for the tool panel's close button) both sit top-right of a panel header for the same "close this panel" role — but `.tool-panel-close` is a hand-rolled reimplementation from scratch rather than reusing `.nx-action-btn-icon`, so nothing stops them from silently drifting apart in box size, focus ring, active-state, or disabled styling.

### Confirmed real instance (since fixed)

A live audit found exactly this: da-live's `.tool-panel-close` was a bespoke reimplementation missing states and running a 16px icon, while chat-ao's shared-class close button was 18px with full states — check 1 and check 4 both caught it. Now fixed: the button reuses `.nx-action-btn-icon`, and icon sizing across the product runs through the `--s2-icon-size` token instead of scattered literals.

## Scope: icon-button presentation only

Only ever look at: icon-button box size (width/height/padding), the `<svg>`/icon size inside it, and interaction-state styling (`:hover`, `:focus-visible`, `:active`, `.is-active`, `&:disabled`). Do not propose changing which icon/glyph is used, its color for non-interactive reasons (e.g. semantic error/success coloring), or layout/positioning — this skill is about whether same-role controls *behave* identically, not about redesigning any of them.

## The four checks

### 1. Bespoke reimplementation of an existing shared class

Before comparing two icon buttons, check whether one of them duplicates a shared class's pattern (same box size, same layout shape) with its own one-off class instead of using the shared one directly. This is the root-cause check — flag it even before diffing exact values, because a bespoke reimplementation is *why* drift keeps happening; unifying the values without fixing this just means the next edit drifts again.

Shared icon-button classes to check against: da-nx's `.nx-action-btn-icon` (`nx2/styles/buttons.css`) and da-live's `.da-icon-btn` (`blocks/shared/styles/base.css`, marked legacy — a `/* form.css -> switch to use nx */` comment sits above it — but still actively used, e.g. `ew-canvas-versions`, `ew-file-explorer`).

These two "shared" classes are not a matched pair: as of this writing `.da-icon-btn` is 24×24 with a 16px icon, no `:focus-visible`, and hover `--s2-gray-100`, while `.nx-action-btn-icon` is 32×32/18px with full states and the `--s2-icon-size` token. Don't assume picking either one as the reuse target is automatically correct — check which convention the surrounding component already follows, and flag the cross-class gap itself as a finding (per check 4) rather than silently treating one as canonical.

### 2. Same role → same box + icon size

Group icon buttons by their functional role, not by which component file they live in. Read the paired `.js` template's `aria-label`/`title` to determine role — e.g. every "close this panel" button is one group, every "more options" button is another, regardless of which panel they close. Within a group, the button's box (width/height/padding) and the `<svg>`'s own width/height must match. Flag any member of a group whose size differs from the rest, even if it "looks fine" in isolation.

### 3. Same role → same interaction states

Within a role group, `:hover`, `:focus-visible`, `:active`/`&.is-active`, and `:disabled` styling (background color, border, opacity, transform) must produce the same visual behavior. Flag a group member that's missing a state the others have (e.g. no focus-visible ring while its siblings have one), or that uses a different color/opacity for the same state.

### 4. Hardcoded pixel size instead of a shared token

An icon box or `<svg>` size written as a literal (`width: 18px`) instead of a design token (`width: var(--s2-icon-size)`) is itself a finding, even if the value happens to match everywhere today — a literal can't be bumped product-wide in one place, so it's exactly what let check 2's divergences happen silently in the first place. `nx2/styles/styles.css` defines `--s2-icon-size` (currently `18px`) as the canonical icon size token; flag any icon-button rule hardcoding a pixel value instead of referencing it, and propose switching to the token even when the literal value is already correct. When a rule lives in a different repo than the token (e.g. da-live consuming a da-nx token via `getNx2()`), propose `var(--s2-icon-size, <current-value>)` with a fallback, since the two repos don't always deploy in lockstep.

## Output format

Never edit files. A markdown table reads as too long/heavy for this — report findings as terse, one-line-per-finding bullets instead, grouped under a heading per surface (e.g. "Chat", "Editor panels", "Tool panel") when findings span more than one:

`<file>:<line> — <role/aria-label> — <bespoke or shared, and the divergence> — <proposed fix>`

Example: `tool-panel.js:245 — "Close panel" — bespoke .tool-panel-close, 16px icon vs shared class's 18px, no focus/active/disabled states — switch to .nx-action-btn-icon`

If asked for more detail on a specific finding, add concrete UI navigation steps then (hover/click path to see it live) — don't pad every bullet with that up front. If a role group is fully consistent, don't report it — only report groups with a real divergence.

## When the fix isn't obvious: flag for a human decision

Same principle as `ew-text-unify`: if a group's members disagree and there's no way to tell which one is the intended behavior (both are plausible design choices, e.g. one has a subtler hover than the other and either could be intentional), say so and mark the fix `NEEDS HUMAN DECISION` instead of guessing which one is "right."
