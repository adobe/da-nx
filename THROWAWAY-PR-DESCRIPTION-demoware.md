# PR: Skills Lab / generated-tools demoware (throwaway description — delete this file after paste)

## Title (suggested)

`feat(skills-lab): Skills Lab + generated tools POC (demoware)`

## Summary

This pull request is **demonstration / proof-of-concept work**. It is **not** intended as production-hardened product: UX, persistence contracts, security review, and operational rollout are still open. The goal is to **show** an end-to-end slice—browse-hosted Skills Lab, canvas “Tools Quick Editing” integration, client-side generated-tool proposals, and **draft** vs approved skill handling—so stakeholders can react before we invest in a long-term design.

Treat merges as **enabling a demo branch** (`feat/skills-lab-exp` and related), not as locking in final architecture.

## UX flow

1. **Open Skills Lab** from browse (`apps/skills`) with `#/{org}/{site}/skills-lab` (or land without org/site and use the gate to pick context). You get a **four-column style layout**: **Tool Editor** (skill markdown + save lifecycle), **tools** (available vs generated), and a **catalog** with tabs (Skills, Agents, Prompts, MCPs) plus draft/approved filters.
2. **Edit a skill** in the Tool Editor: save as **draft** or **approved**; drafts stay out of chat until approved. **Create Skill** from chat can **hand off** prose + suggested id/body into this column; **Dismiss** / column dismiss clears the form and re-syncs chat affordances.
3. **Catalog affordances**: Skills and MCP rows expose an **edit** control that targets the relevant form (skill editor or MCP registration). **Prompts** mirror the chat Tools modal: **category + icon**, **Add to chat** / **Send**, and **Edit** to load the prompt into the Tool Editor for draft/approved saves.
4. **Canvas chat**: **Tools Quick Editing** opens the same conceptual panels (skills, prompts, MCP, generated tools) in a modal; draft save behavior and links toward Skills Lab stay consistent with the full-page experience.
5. **Agent behavior (when `da-agent` is in scope)**: only **approved** skills from config are indexed for the live agent; **draft** rows and `da_create_skill` output stay in draft until explicitly approved—so demos don’t leak unfinished skills into production-style requests.

## What changed (high level)

- **Skills Lab (browse / `apps/skills`)**: full-page experience for catalog + editing; lifecycle filters; tools column; chat-adjacent layout; **no default org/site**—users pick org/site when the hash is missing (same idea as other apps).
- **Canvas**: Tools quick-editing flow, draft save messaging, sidenav ordering, links into Skills Lab where appropriate.
- **`da-nx` supporting code**: browse block, skills lab API helpers, skills editor utils, sidenav Skills Lab URL behavior.
- **`da-agent` (if included in same review cycle)**: loader skips draft skills; `da_create_skill` persists as draft; tests updated.

*(Adjust bullets to match your actual diff if this branch diverges.)*

## How to test

1. Load **Skills Lab** with a real `#/{org}/{site}/skills-lab` hash (and your usual `nx=` / local query flags if needed). Confirm catalog and editor load; confirm **gate form** appears when org/site are missing from the hash.
2. From **canvas**, open **Tools Quick Editing** and exercise skills / generated-tools panels as far as your local stack allows.
3. If **`da-agent`** is in scope: run its unit tests and confirm draft skills do not appear in the agent index until approved.

## Risk / follow-ups

- **Demoware**: expect rough edges, copy tweaks, and possible **API or UX changes** before any “real” ship.
- **Do not rely** on this branch for production behavior without a separate hardening pass (authz, rate limits, error UX, analytics, etc.).
- **Docs / ADRs**: any scratch architecture notes should stay **out of upstream** unless explicitly promoted to official docs.

---

*This file is throwaway-only. Remove `THROWAWAY-PR-DESCRIPTION-demoware.md` before merge or add to `.gitignore` if you keep it locally.*
