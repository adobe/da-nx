# Evaluation fixtures

Mocked brand-governance output for the draft page
`exp-workspace/frescopa/drafts/ramirezc/index` (eyebrow `Our Story`, H1 `Born from a passion for exceptional coffee.`,
a paragraph and a hero picture). See `docs/evaluation-findings.md`.

| File | What it is |
|---|---|
| `frescopa-draft.bga.json` | `evaluate_page` response (`PageEvaluationResult` plus the new `evidence` on `NO` checks). |
| `frescopa-draft.artifact.json` | AO artifact the governance skill would derive from it, flat A2UI form. |
| `frescopa-draft.nested.artifact.json` | Same content, legacy nested `{ type, props }` form. |

The artifact files are full AO artifacts (`id`, `a2ui_surface.components`, `text_fallback`, `display_hints`), i.e. exactly what
`toUiArtifact()` in `utils/episodes.js` consumes. Use them with `?nx-eval-fixture=frescopa-draft` or
`?nx-eval-fixture=frescopa-draft.nested`.

## Cases (Failures section, all `negative`)

| Item id | Tests |
|---|---|
| `fail-header_copy` | Text evidence on the H1 with a replacement. |
| `fail-tone_of_voice` | Second check on the same H1 text, so the host can page "1 of 2". |
| `fail-body_copy` | Partial verbatim quote from the paragraph plus a replacement. |
| `fail-eyebrow` | Text evidence on `Our Story` without a replacement. |
| `fail-superlative_claims` | Quote that does not exist on the page (unresolvable, falls back to the dialog). |
| `fail-call_to_action` | Page-level failure with no evidence. |
| `fail-image_brand_alignment` | Image evidence: `src` is the rendered hero URL (with query string). |

The Passes section (5 items, no `suggestion`) and Not applicable section (2 items) must not produce findings.
Summary tiles: 7 failures, 5 passes, 2 not applicable.
