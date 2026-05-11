# Form — Design Rationale

A note for engineers reviewing this block. It explains why the code is shaped the way it is, what that buys us, and where it leaves room to grow. The goal is not to sell a style; it's to make the trade-offs visible so the next person who edits this code has confidence about where to make changes and where not to.

If you only read one section, read **§1 — Headless core** and **§3 — Testability**. Everything else follows from those two.

---

## 1. Headless core

The block is split into three folders with a single, strictly enforced dependency direction:

```txt
app/  →  core/
app/  →  ui/
ui/   →  core/
```

`core/` does not import from `ui/` or `app/`. It has no Lit, no DOM, no `fetch`, no `window`, no styles. It is a pure JavaScript module that loads a schema and a document, applies mutations, and returns a fresh state snapshot.

This isn't an aesthetic choice. It's the reason the rest of this document is short.

- **One thing owns the truth.** Document values, the runtime model derived from the schema, and the validation result all live in one snapshot returned by `core.getState()`. The UI never invents state about the document. It reads the snapshot and renders.
- **Mutations are functions.** `setField`, `addItem`, `insertItem`, `removeItem`, `moveItem` each take pointer-addressed inputs, run through `commit()`, and produce a new snapshot. They never mutate inputs. They never reach into the DOM. Every mutation goes through the same path: apply → rebuild model → validate → persist.
- **Persistence is a callback, not a coupling.** `createCore({ path, saveDocument })` accepts `saveDocument` as an injected function. In production the shell wires it to `serialize() → saveSourceHtml()`. In tests you wire it to a tracking function and assert on what it received. The core itself doesn't know there's a network.

What this prevents: drift between the document the UI thinks it has, the document the validator thinks it has, and the document we just POSTed. They are by construction the same object.

---

## 2. Layered structure on disk

```txt
form/
  form.js             Lit shell: routing, context loading, mounts core
  core/               Pure JS, headless. Tested in Node.
    index.js          createCore() — the public API
    schema.js         resolveSchema + compileSchema (refs, allOf/oneOf/anyOf)
    model.js          buildModel + pointer→node Map, in one pass
    mutate.js         setField, addItem, insertItem, removeItem, moveItem
    pointer.js        RFC 6901 ops + definitionAt
    validation.js     validateDocument → { errorsByPointer }
    ids.js            stable array-item id assignment
    clone.js          single deepClone util
  app/                I/O boundary
    context.js        loadFormContext — fetches doc HTML + schemas, routes status
    da-api.js         thin DA source endpoint wrappers
    schemas.js        schema discovery + module cache
    serialize.js      json → html via json2html
    html2json.js      vendored converter
    json2html.js      vendored converter
  ui/                 Lit web components
    shell.css, editor.{js,css}, sidebar.{js,css}, preview.{js,css},
    array-menu.{js,css}, reorder.{js,css}
```

Each folder has one job. When something breaks, you can name the folder before you open a file:

- Wrong value saved → `core/mutate.js` or `app/serialize.js`.
- Wrong field shape → `core/schema.js` or `core/model.js`.
- Wrong markup → `ui/editor.js`.
- Wrong endpoint or auth → `app/da-api.js`.
- Wrong route or status screen → `form.js` (shell only).

You don't have to grep utility files looking for which one owns the bug.

---

## 3. Testability

The core has 1,816 lines of tests under [test/form/](test/form/), broken into `core/` and `app/` suites. The core suites import from `nx/blocks/form/core/index.js` directly — no DOM, no Lit, no test harness setup. They run in milliseconds in Node-compatible mode and exercise:

- `createCore.load` with valid, malformed, and unsupported schemas
- Every mutation (`setField`, `addItem`, `insertItem`, `removeItem`, `moveItem`)
- Schema compilation: `$ref`, `allOf`, `oneOf`/`anyOf` rejection, cycle protection
- Model build: kind inference, defaults, required/readonly, byPointer map
- Validation: per-rule error production
- Array item id stability across reorders and content edits
- RFC 6901 pointer escape/unescape, parent/append/value-at

The shape this is possible *because* `core/` is headless. The moment any of those modules import Lit or call `fetch`, the test cost goes from "import and call a function" to "spin up a browser and a network mock." We have chosen to pay the discipline cost up front so we never have to pay the browser cost in CI.

If you want to add coverage: drop a `*.test.js` next to the existing ones, import the function, write the assertion. No fixtures of HTML, no shadow DOM queries, no `await aTimeout(0)`.

---

## 4. State shape and reactivity

The shell holds two reactive properties:

```js
_state = { document: { values }, model, validation: { errorsByPointer } }
_nav   = { pointer, origin, seq }
```

That's it. Everything else is derived.

- A mutation produces a new `_state`. Children re-render.
- A selection produces a new `_nav`. Children that care about focus re-render.
- The shell hands `core` plus `onMutate`/`onSelect` callbacks to children as property bindings. The callbacks are arrow-fn properties bound once in the constructor, so they have stable identity — Lit does not re-render on callback churn.
- CustomEvents are reserved for signals that cross a shadow root boundary from a nested component (e.g. `array-menu` → `editor`). They are not the primary communication path.

The reactivity story is small enough to keep in your head: two props, one direction, callbacks stable. This is also why the performance review in [PERFORMANCE-REVIEW.md](nx/blocks/form/PERFORMANCE-REVIEW.md) can talk concretely about what re-renders when — there's nothing hidden.

---

## 5. Conventions we follow

These come from [AGENTS.md](AGENTS.md) at the repo root and are not invented for this block:

- **`undefined` means "not loaded yet."** `null` means "absent." `''` means "explicitly cleared." `core.getState().model` is `null` when the schema is unsupported and the form is not editable; it is never `undefined` after `load()` resolves. Renderers can branch on this without re-checking shapes.
- **Parse, don't validate.** `parseDocument` accepts or rejects the input at the boundary and returns either a clean shape or `null`. Downstream code does not re-check.
- **Destructured object params** for any function with two or more arguments — `setField({ document, pointer, value, node })` rather than positional. New parameters can be added without breaking callers.
- **Functional pattern.** Mutations don't reach into `this`. They take input, return output. `let` is avoided where `const` works.
- **Companion utils.** `core/` is the companion to the Lit components — DOM-aware code stays in the component, data transforms go in core. Components don't need to be small if they're focused, but data shaping never lives in a render method.
- **Lazy load non-critical deps.** `da-dialog` loads only when a block screen needs it. `sl/components` loads only when the schema picker is shown. `array-menu` and `reorder` load from the editor's `firstUpdated`. None of these gate first paint.

The point of citing this is not to argue from authority. It's that an engineer who reads AGENTS.md and then reads this block will find the block already does what AGENTS.md says to do, in the same way the rest of the repo does. There is nothing local-to-this-block to learn.

---

## 6. Addressing: RFC 6901 pointers

Every field in the document has a canonical address: an RFC 6901 JSON Pointer like `/data/items/3/title`. Pointers are used everywhere:

- The editor renders fields keyed by pointer.
- The sidebar highlights the active pointer.
- Validation errors are returned as `errorsByPointer`.
- Mutations are addressed by pointer.
- Navigation events carry a pointer.

This is not glamorous, but it removes a class of bug: there is one way to refer to a field, and it survives JSON serialization, URL hashes, log lines, and test assertions. No ad-hoc path-string formats.

Where pointers don't work — array reordering — we use stable per-item IDs from `core/ids.js`. Pointers address position; IDs identify items. Lit uses the IDs as render keys, so an item that moves keeps its DOM and its focus. The split is documented at the top of [core/ids.js](nx/blocks/form/core/ids.js) and tested directly.

---

## 7. Strict schema policy

`compileSchema` returns `{ definition, editable, issues }`. If the schema contains any unsupported composition (`oneOf`, `anyOf`, multi-entry `allOf`), `editable` is `false` and the editor does not render. We surface the reason; we do not silently render a partial form.

This is a deliberate trade-off. The cost is: schemas with unsupported features cannot be edited at all. The benefit is: a user never edits and saves a document believing they edited a field that the editor silently dropped. Silent partial rendering is the kind of bug you find in production six months later when a customer asks why their data is gone.

If the trade-off becomes wrong — e.g. a schema we need has one unsupported subtree — the path forward is documented in [ARCHITECTURE.md §9](nx/blocks/form/ARCHITECTURE.md): render an `unsupported` node inline while keeping the rest editable. The core already produces `unsupported` markers; only the editor needs to learn to render them.

---

## 8. Performance properties, with honesty

The full review is in [PERFORMANCE-REVIEW.md](nx/blocks/form/PERFORMANCE-REVIEW.md). The short version:

**Typing feels instant regardless of doc size**, because the native `<input>` echo is not blocked by the mutation pipeline. The pipeline runs after a 350 ms per-pointer debounce and is fire-and-forget from the UI's point of view.

**Mutation cost is O(N)** in number of fields. For typical docs (50–500 fields) this is well under a frame. For very large docs (5,000+ fields) it becomes measurable. The review identifies three concrete fixes (per-field incremental validation, structural sharing in `buildModel`, sidebar `shouldUpdate`) with effort estimates. None of them require structural rework — they slot into the existing layout.

**Known limits we have not yet paid down**, listed so you can see we are not hiding them:

- Hash-change tears down the editor even when the same document is being viewed. Fix is a path comparison; small.
- Validation re-runs the whole tree on a single-field change. Fix is `validateField`; small.
- Saves are fire-and-forget with no in-flight tracking. A fast typist's earlier POST can land after a later one. Fix is a single-flight wrapper with a `pending` flag; small and explicitly documented in the review.

The reason to list these is that the *cost of fixing them is small precisely because of the layering*. A `validateField` lives next to `validateDocument` in `core/validation.js`. A single-flight save wraps `persist()` in `core/index.js`. No UI changes are needed for any of them.

---

## 9. Extending the form

Three common changes, and where they go:

**Add a new field kind** (e.g. `date`, `richtext`):

1. In `core/schema.js`, add the new value to `inferKind` so `compileSchema` recognizes it.
2. In `core/model.js`, ensure node construction handles the new kind (usually no change — `kind` is carried through).
3. In `ui/editor.js`, add a render branch. The editor switches on `kind` and never falls through to a default — this is a deliberate rule from [ARCHITECTURE.md §6](nx/blocks/form/ARCHITECTURE.md).
4. Add tests in `test/form/core/schema.test.js` and `model.test.js`.

No new abstractions, no new files unless the renderer is large enough to warrant one.

**Add a new validation rule:**

Add it to `core/validation.js`. Add a test in `test/form/core/validation.test.js`. Done. The rule appears in `errorsByPointer` and the editor already renders inline errors keyed by pointer.

**Change the persistence backend:**

Swap the `saveDocument` callback passed into `createCore`. Today the shell wires it to `saveSourceHtml`. A different backend is a different callback. No core changes.

---

## 10. What the architecture buys us, in one paragraph

A new engineer can read `core/index.js` (195 lines) and understand the entire data flow in fifteen minutes. They can run the test suite without a browser. They can change a mutation and watch a focused test fail. They can add a field kind without touching networking or styles. They can read the performance review and see the same data flow described, with named bottlenecks and named fixes. When the next product requirement lands, we don't have to guess where it goes — the layer that owns it is the layer the requirement names.

That is the argument. The code is not interesting because it's clever. It's interesting because it is boring in a predictable way, and that predictability is what we are buying.

---

## 11. Pointers to the rest of the documentation

- [ARCHITECTURE.md](nx/blocks/form/ARCHITECTURE.md) — formal layout, public API, dependency rules, rules of the road.
- [PERFORMANCE-REVIEW.md](nx/blocks/form/PERFORMANCE-REVIEW.md) — hot-path walk, ranked bottlenecks, reactivity audit.
- [test/form/](test/form/) — core and app test suites, the executable specification.
- [AGENTS.md](AGENTS.md) — repo-wide conventions that this block follows.
