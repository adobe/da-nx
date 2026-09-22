# ew-icon-unify

Sister skill to `ew-text-unify`, same purpose applied to icon buttons instead of text: audit Experience Workspace (EW) components for icon-button controls that serve the *same role* (close a panel, more-options, add, etc.) but were implemented independently and drifted apart in size, color, or interaction states. Report only — never edit files directly.

## Why this exists

Example that prompted this skill: `nx2/styles/buttons.css`'s shared `.nx-action-btn-icon` (used by, among others, chat-ao's close-chat-panel button) and da-live's `tool-panel.css`'s `.tool-panel-close` (used for the tool panel's close button) both sit top-right of a panel header for the same "close this panel" role — but `.tool-panel-close` is a hand-rolled reimplementation from scratch rather than reusing `.nx-action-btn-icon`, so nothing stops them from silently drifting apart in box size, focus ring, active-state, or disabled styling.

### Confirmed real instance (2026-09-22)

Audited via live HTML pulled from a `da-live` canvas: `.nx-action-btn-icon.nx-btn-sm` (chat-ao's "Close chat panel", `nx2/blocks/chat-ao/chat-ao.js:383-387`) is a 24×24 box with a 16×16 icon, and ships `:focus-visible` (blue outline), `:active` (scale 0.97), and `:disabled` (opacity 0.4) states from the shared class (`nx2/styles/buttons.css:5-64,118-137`). da-live's `.tool-panel-close` ("Close panel", `blocks/canvas/ew-tool-panel/tool-panel.js:245`, styled at `blocks/canvas/ew-tool-panel/tool-panel.css:28-49`) is a 32×32 box around the same 16×16 icon size, and defines only `:hover` — no focus ring, no active-press, no disabled state. Root cause: `tool-panel.js` never imports `nx2/styles/buttons.css` at all (contrast `ew-canvas-header.js:12`, which does, and whose `.comments-toggle` correctly layers on top of `.nx-action-btn-icon` instead of reimplementing it).

## Scope: icon-button presentation only

Only ever look at: icon-button box size (width/height/padding), the `<svg>`/icon size inside it, and interaction-state styling (`:hover`, `:focus-visible`, `:active`, `.is-active`, `&:disabled`). Do not propose changing which icon/glyph is used, its color for non-interactive reasons (e.g. semantic error/success coloring), or layout/positioning — this skill is about whether same-role controls *behave* identically, not about redesigning any of them.

## The three checks

### 1. Bespoke reimplementation of an existing shared class

Before comparing two icon buttons, check whether one of them duplicates a shared class's pattern (same box size, same layout shape) with its own one-off class instead of using the shared one directly. This is the root-cause check — flag it even before diffing exact values, because a bespoke reimplementation is *why* drift keeps happening; unifying the values without fixing this just means the next edit drifts again.

Shared icon-button classes to check against: `.nx-action-btn-icon`, `.da-icon-btn` (both defined in `nx2/styles/buttons.css` / `blocks/shared/styles/base.css`).

### 2. Same role → same box + icon size

Group icon buttons by their functional role, not by which component file they live in. Read the paired `.js` template's `aria-label`/`title` to determine role — e.g. every "close this panel" button is one group, every "more options" button is another, regardless of which panel they close. Within a group, the button's box (width/height/padding) and the `<svg>`'s own width/height must match. Flag any member of a group whose size differs from the rest, even if it "looks fine" in isolation.

### 3. Same role → same interaction states

Within a role group, `:hover`, `:focus-visible`, `:active`/`&.is-active`, and `:disabled` styling (background color, border, opacity, transform) must produce the same visual behavior. Flag a group member that's missing a state the others have (e.g. no focus-visible ring while its siblings have one), or that uses a different color/opacity for the same state.

## Output format

Never edit files. Report findings as a table, most-important first:

| Files:Lines | Role group | Bespoke or shared? | Divergence | Proposed | How to see it |
|---|---|---|---|---|---|

- **Role group**: the shared purpose you grouped these buttons under (e.g. "Close panel button", "More options / overflow menu trigger"), plus the `aria-label`/`title` text(s) that identified it.
- **Bespoke or shared?**: whether each member reuses a shared class or reimplements it — call out any bespoke ones per check 1.
- **Divergence**: exactly what differs (e.g. "icon 20px vs sibling's 18px", "no `:focus-visible` state", "hover background `--s2-gray-100` vs sibling's `--s2-gray-200`").
- **Proposed**: the concrete fix — ideally "switch to `.nx-action-btn-icon`" if a bespoke class is duplicating a shared one; otherwise the specific value/state to add or change to match the group.
- **How to see it**: concrete UI navigation steps for *each* member of the group, so someone can hover/click through and see the difference live, not just read it in a diff.

If a role group is fully consistent, don't report it — only report groups with a real divergence.

## When the fix isn't obvious: flag for a human decision

Same principle as `ew-text-unify`: if a group's members disagree and there's no way to tell which one is the intended behavior (both are plausible design choices, e.g. one has a subtler hover than the other and either could be intentional), set **Divergence** to describe the conflict, **Proposed** to `NEEDS HUMAN DECISION`, and still fill in **How to see it** for every member.
