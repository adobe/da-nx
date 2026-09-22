# ew-text-unify

Audit an Experience Workspace (EW) component's CSS for text-sizing problems the eye misses: hardcoded pixel values instead of design tokens, the wrong token *family* for an element's role, and sibling elements that should read as one size but don't. Report only — never edit files directly.

## Scope: font-size only, nothing else

This skill exists to unify sizing and remove hardcoded values — it is **not** a general style cleanup pass. Only ever touch (propose changes to) the `font-size`/`line-height` declaration that actually violates one of the 3 checks below. Never propose changing `font-weight`, `color`, or any other property on the same rule just because it happens to reference a token from a "different family" than the font-size fix — if that property wasn't hardcoded and wasn't itself flagged, it isn't broken, and existing styles are not to be changed outside the specific violation found. A fixed rule can end up referencing tokens from two different families across its different properties (e.g. `font-size: var(--s2-body-size-l)` next to `font-weight: var(--s2-component-xl-bold-font-weight)`) — that's expected and fine, not something to "clean up" further.

## When to use

Given one or more CSS files (plus their paired `.js` templates, to read each selector's actual markup role), find every `font-size` / `line-height` declaration and check it against the three rules below.

## The three checks

### 1. No raw px — must be a `--s2-*` token

Any `font-size`/`line-height` value that is a literal number (e.g. `12px`, `0.875rem`) instead of `var(--s2-...)` is a violation, regardless of whether the number is "correct." Flag it even if the fix is a same-value token swap (e.g. `12px` → `var(--s2-component-s-regular-font-size)`, no visual change) — token-hygiene matters even without a size change.

### 2. Right token *family* for the element's role

Two token families exist and are easy to swap by mistake because they overlap in value:

- `--s2-body-size-*` (xxs 11 / xs 12 / s 14 / m 16 / l 18 / xl 20 / xxl 22 / xxxl 25) — for **reading content**: paragraphs, chat messages, prose, comment bodies.
- `--s2-component-*-{regular,medium,bold}-font-size` (xs 11 / s 12 / m 14 / l 16 / xl 18) — for **UI controls**: buttons, menu items, labels, pickers, tabs.

To judge which family a selector should use, read its markup usage in the paired `.js` file: is it a `<button>`/menu item/picker/tab (→ component), or is it a `<p>`/message body/comment text/prose (→ body)? Flag any place using the wrong family, even if the numeric size happens to be correct — e.g. `--s2-component-s-regular-font-size` (12px) used on a `<p>` of chat message text should be `--s2-body-size-xs` (12px) instead, same number, wrong family.

**Default bias: component, not body.** Per design guidance, EW mostly uses component style — the component family is the default for anything that isn't clearly reading content. Reserve `--s2-body-size-*` specifically for genuine prose/reading content: paragraphs, chat message bodies, comment bodies, rendered markdown. Everything else — status badges, labels, titles, hints, instructional/empty-state messages, anything sitting inside or next to a `<button>`/control — defaults to component family, even when it's not itself interactive. When a case is ambiguous (not clearly prose, not clearly a control), prefer component family rather than treating it as a coin flip.

**When proposing a body → component swap, always name the matching component token by value** — don't just say "switch to component family," give the exact token. Use this correspondence (body size → nearest component tier, same px value where one exists):

| Body token (px) | Nearest component tier (px) | Exact match? |
|---|---|---|
| `--s2-body-size-xxs` (11) | `xs` (11) | Yes |
| `--s2-body-size-xs` (12) | `s` (12) | Yes |
| `--s2-body-size-s` (14) | `m` (14) | Yes |
| `--s2-body-size-m` (16) | `l` (16) | Yes |
| `--s2-body-size-l` (18) | `xl` (18) | Yes |
| `--s2-body-size-xl` (20) | `xl` (18) | No — 2px short, flag for visual confirmation rather than asserting it's a silent no-op |
| `--s2-body-size-xxl` (22) | `xl` (18) | No — 4px short, flag for visual confirmation |
| `--s2-body-size-xxxl` (25) | `xl` (18) | No — 7px short, flag for visual confirmation |

Component family also needs a weight variant (`-regular-`, `-medium-`, `-bold-`) that body tokens don't carry — infer it from the existing `font-weight` on the same rule: bold text → `-bold-`, an explicit medium weight → `-medium-`, otherwise → `-regular-` (body family's implicit default). Don't change the `font-weight` declaration itself (see Scope above) — only use it to pick which component tier's font-size to reference.

### 3. Sibling / same-level consistency

Elements that sit at the same logical level of a UI hierarchy — items within one list, buttons within one toolbar row, tabs within one tab bar, cards within one grid — must share the same font-size token. Read the markup to find these groups (usually siblings under a shared parent, or elements rendered from the same `.map()`/loop). Flag any sibling whose font-size differs from the rest of its group, even if each one individually looks "valid" (uses a real token, just a different one than its siblings).

**Caveat — visual adjacency isn't the same as being peers.** Two elements can render at the same position/level in a list (e.g. both appear inline among chat messages) without serving the same *purpose*. A transient loading/status placeholder (a "Thinking..." shimmer, a spinner label) is not a peer of substantive, inspectable content (a tool-call card, a message) just because both can appear in the same stream — the placeholder is disposable UI chrome, closer in spirit to a hint/disclaimer than to real content, and is allowed to stay smaller on purpose. Before flagging a sibling mismatch, check whether one side is actually ephemeral/status chrome rather than content — if so, don't flag it.

## Output format

Never edit files. Report findings as a table, most-important first:

| File:Line | Selector | Actual text | Current | Issue | Proposed | How to see it |
|---|---|---|---|---|---|---|

- **Actual text**: the real visible copy this selector renders, read from the paired `.js`/template (a literal string, or a short description if it's dynamic — e.g. "Markdown heading in AI response, varies per message"). This is what lets someone spot the finding in the running UI without reading code.
- **Current**: the exact current declaration value.
- **Issue**: which of the 3 checks failed, one short clause (e.g. "raw px, no token", "component family on prose text", "inconsistent with sibling `.foo-item` at line N").
- **Proposed**: the exact token to use instead (e.g. `var(--s2-body-size-s)`).
- **How to see it**: concrete UI navigation steps to reproduce the element live — which panel/tab to open, what action to take (e.g. "Open chat, send any message and wait for the response to start streaming" or "Send a message that triggers a tool call, e.g. ask it to read the current page, then look at the collapsed summary line before expanding it"). Write it so someone with no code context can find the exact element by following the steps.

If a file has zero violations, say so plainly — don't invent findings.

## When the fix isn't obvious: flag for a human decision

Sometimes two or more elements clearly *should* match (same role, same visual weight) but disagree on family/size, and there's no way to tell from the code alone which one is the "correct" side and which is the outlier — both look like reasonable, deliberate choices. Don't force a proposal in that case. Instead:

- Set **Issue** to `NEEDS HUMAN DECISION` and describe the conflict (which elements disagree, and why either direction is defensible).
- Leave **Proposed** as `—` rather than guessing.
- Still fill in **Actual text** and **How to see it** for *every* element in the conflict, not just one — a human can't make the call without being able to look at all sides of it in the running UI.
