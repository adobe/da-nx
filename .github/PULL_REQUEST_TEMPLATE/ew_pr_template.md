<!-- EW_PR_TEMPLATE -->
# [EW] Experience Builder — PR

## Summary

<!-- One sentence: what does this PR do and why? -->

## Related issue / RFC

Fixes # <!-- GitHub issue or RFC link -->

## Test URLs

| | URL |
|---|---|
| Before | `https://main--da-nx--<owner>.hlx.live/` |
| After | `https://<branch>--da-nx--<owner>.hlx.live/` |

---

## Definition of Done checklist

> Fill this out. CI will fail if required items are unchecked.

### Functional

- [ ] Feature behaves as specified (manual smoke-test on After URL above)
- [ ] No regressions in adjacent features (browse, canvas, chat, quick-edit, loc)
- [ ] Dark / light theme renders correctly (if visual change)

### Quality

- [ ] `npm test` passes locally (or unit failures are pre-existing and noted below)
- [ ] No new lint errors (`npm run lint`)
- [ ] No new `console.error` / `console.warn` in the browser at runtime
- [ ] JS added/changed is plain ESM — no CommonJS, no bundler churn without buy-in

### Architecture & contracts

- [ ] Client code does **not** contain orchestration / session logic (belongs in backend repo)
- [ ] Any new wire shapes are documented (inline JSDoc or `aem-agent-contracts` entry)
- [ ] No `any` / untyped casts on contract boundaries
- [ ] CSS uses block-scoped selectors; no accidental global overrides
- [ ] Lazy-loading used for non-critical paths (or absence is justified)

### Skills Lab (check if Skills Lab changed in this PR)

- [ ] Skills Lab changed in this PR
- [ ] All 13 Playwright E2E tests pass: `cd da-live/test/e2e && npx playwright test tests/skills-lab.spec.js --project=chromium`
- [ ] Data model `{ id, body, status }` preserved
- [ ] Dual storage preserved: `/.da/skills/{id}.md` **and** config sheet row
- [ ] `.md` file-content-wins merge rule preserved
- [ ] Public CSS selectors unchanged (or tests updated in same PR): `.skills-lab-card-skill`, `.skills-lab-card-title`, `.skills-lab-skill-edit`, `.skills-lab-save-row`, `.skills-lab-cat-tab`, `.skills-lab-tools-col`, `.skills-lab-loading`, `.skills-lab-section-h`
- [ ] DA admin API surface unchanged: `/source`, `/config`, `/list`

### E2E / integration

- [ ] Ran Playwright smoke suite locally **or** confirmed not applicable (no routing / API changes)

### Security

- [ ] No secrets, tokens, or credentials in source or test files
- [ ] AuthN/AuthZ ordering respected: authenticate → authorize → capabilities → resolve
- [ ] No capability resolution before policy check

### Branch hygiene

- [ ] Branch is up to date with `origin/ew` (rebased, not merged)
- [ ] Commits are logical and message follows `type(scope): subject` convention
- [ ] PR targets `ew` (not `main` / `exp-workspace`)

---

## Notes for reviewer

<!-- Anything non-obvious, trade-offs, follow-ups, known issues -->
