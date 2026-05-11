# Form — Why this version

## The problem

The previous implementation is hard to maintain. Concerns are mixed across files, there is no headless layer, and the code is effectively untestable. Patching it, applying customer feedback, or adding features carries real risk of regressions — there is no automated safety net to catch them.

This is no longer hypothetical. Customers are evaluating Structured Content, partners are building around it, and the rate of change is going up:

- **Customer evaluations** are producing feedback that must land without breaking what already works.
- **External tooling** like the experimental DA import app needs to save documents programmatically. Saving correctly requires the same core logic the editor uses (validation, prune, materialization, serialization). Copying that logic into each consumer guarantees drift.
- **Partner MCP attempts** are already producing workarounds because the existing code is not reusable.

## The solution: simplicity first

Rebuilt with **simplicity as the primary goal**. Testability and reusability follow from it — they are not separate objectives.

Three layers with strict one-way dependencies (`app → core`, `ui → core`, never the reverse):

- **`core/`** — fully headless. Owns all data handling. No DOM, no Lit, no `fetch`.
- **`app/`** — the I/O boundary.
- **`ui/`** — thin, dumb renderer. A pure function of the snapshot core hands it.

Full architecture and the rules for keeping it this way: [ARCHITECTURE.md](nx/blocks/form/ARCHITECTURE.md).

## Simplicity, measured

Every concern lives in one small place. Open one file, change it, move on.

| Concern | File | Lines |
|---|---|---|
| Public API (`load` + 5 mutations + save lifecycle) | [core/index.js](nx/blocks/form/core/index.js) | 249 |
| Every document mutation | [core/mutate.js](nx/blocks/form/core/mutate.js) | 107 |
| Every validation rule | [core/validation.js](nx/blocks/form/core/validation.js) | 174 |
| Pointer addressing (RFC 6901) | [core/pointer.js](nx/blocks/form/core/pointer.js) | 157 |
| Schema compilation | [core/schema.js](nx/blocks/form/core/schema.js) | 341 |
| Prune + JSON→HTML adapter | [app/serialize.js](nx/blocks/form/app/serialize.js) | 43 |
| Deep clone | [core/clone.js](nx/blocks/form/core/clone.js) | 4 |

The state snapshot is **4 fields**: `document`, `model`, `validation`, `saveStatus`. The renderer reads `node.value` and returns it — no fallbacks, no flags, no derived state. Mutations are functions, not method calls on a stateful object: same inputs, same outputs, no aliasing.

A new engineer can read [core/index.js](nx/blocks/form/core/index.js) in fifteen minutes and understand the entire data flow.

## Reusability comes for free

Because `core/` is headless and the architecture is enforced, anything that needs to mutate or persist a structured content document can import it directly — a CLI script, the DA import app, an MCP server, an AI tool. Same code path as the editor, no drift. This wasn't a design goal; it's what falls out of keeping the core simple.

## What is tested

**204 tests, ~2.5 seconds, headless.** No browser harness, no DOM mocks, no network.

| Area | What is verified |
|---|---|
| **End-to-end data integrity** | A typed value saved and reloaded comes back identical, across the full chain `setField → serialize → json2html → html2json → load`. 13 tests covering strings, numbers, integers, booleans (including `false`), enums, defaults, nested objects, arrays of objects, reordering, edit-on-reload. |
| **Save lifecycle** | Error result and thrown rejection both surface as `saveStatus: 'error'`. Single-flight prevents parallel POSTs; bursts collapse to one trailing save; the re-queued save carries the latest content; an error breaks the queue; `load` clears any pending re-queue. No-op mutations don't trigger saves. |
| **Mutations** | `setField`, `addItem`, `insertItem`, `removeItem`, `moveItem` across every field kind. `minItems`/`maxItems` honored, `readonly` respected, inputs never aliased. |
| **Schema policy** | `$ref` resolution with cycle protection, `allOf` merge, `oneOf`/`anyOf` explicitly refused (no silent degradation). |
| **Validation** | Required, minLength/maxLength, pattern, minimum/maximum, integer-only, enum, array shape. |
| **Defaults** | Materialized into the document on empty load. Not re-materialized on non-empty load. Cleared fields stay cleared. Nested object defaults. Arrays stay empty. Implicit `false` for booleans without an explicit default. |
| **HTML/JSON conversion** | Both converters individually, plus their composition via the end-to-end suite. |
| **Pointer addressing** | RFC 6901 parse/escape/append, value-at, parent-of, definition resolution. |
| **Array item identity** | Stable IDs across reorder and across no-op rebuilds. |

## Known limits

- **Fully-cleared documents reload with defaults.** The storage format can't encode "intentionally empty." Documented in [ARCHITECTURE.md §11](nx/blocks/form/ARCHITECTURE.md).
- **No UI-layer tests yet.** Render-side bugs are caught by review, not automation. Separate piece of work.
- **Performance items at large document sizes** — named with fixes in [PERFORMANCE-REVIEW.md](nx/blocks/form/PERFORMANCE-REVIEW.md). Don't bite at typical sizes.

Listed so nothing critical is hidden behind "future work."
