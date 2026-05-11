# Form — Performance Review

A walk through the hot paths, the bottlenecks they expose, and how reactive updates flow through the Lit tree. Recommendations at the bottom are prioritized; pick what's worth the maintenance cost.

---

## 1. What "fast enough" should mean here

This block is an editor for human-authored structured content. The performance envelope is:

| Dimension | Realistic worst case | Budget |
|---|---|---|
| Document size | 50–200 KB JSON, ~50–500 fields | Operations on the doc are O(size) and run on a keystroke — they must stay under ~16 ms to keep typing at 60 fps. |
| Schema size | < 100 KB, < 1000 properties total after `$ref` resolution | Compile happens once per load — budget ~100 ms. |
| Initial load | First paint of the loading spinner | < 200 ms after the block module starts. |
| Time-to-edit | From `init(el)` to a working editor | < 1 s on a warm cache, < 2 s cold. |
| Save latency | After typing stops | One round-trip per debounced burst; debounce 350 ms. |
| Typing latency | Keystroke → character visible | Native input echo is immediate (the `<input>` value is uncontrolled in the React sense — we don't block the DOM). The mutation pipeline runs in the background after 350 ms. So typing should *feel* instant regardless of doc size. |

Anything that pushes the per-keystroke pipeline past 16 ms on a representative doc is a real problem. Anything that pushes initial load past 1 s on a warm cache is a real problem.

---

## 2. Hot paths

### 2.1. Initial load

```txt
init(el)
  ├─ getPathDetails()                            sync
  ├─ create <da-title> + <sc-form>               sync
  └─ <sc-form> upgrades
       ├─ updated() sees details                 sync
       └─ _loadContext()
            ├─ status = 'loading' → render spinner
            ├─ loadFormContext({ details })       ← network
            │    ├─ loadSchemas (DA list + N source GETs)
            │    └─ fetchSourceHtml(details.sourceUrl)
            ├─ if ready:
            │    └─ _start({ schema, json })
            │         └─ core.load({ schema, document })
            │              ├─ compileSchema(schema)         ← CPU
            │              ├─ parseDocument(document)       ← deep clone
            │              └─ rebuildModel(doc)
            │                   ├─ buildModel               ← deep clone + tree walk
            │                   └─ validateDocument         ← tree walk
            └─ status = 'ready' → render editor + sidebar + preview
```

**Blocking before first paint:**

The shell module awaits the shared `utils/styles.js` helper and the shell stylesheet before the element is declared. Each UI module also awaits its own stylesheet load at module top. The screen-specific deps (`da-dialog`, `sl/components`, `array-menu`, `reorder`) are lazy-loaded against the status route — `da-dialog` only when blocked, `sl/components` only when the schema picker is shown, `array-menu` / `reorder` from the editor's `firstUpdated` — so they don't gate the spinner.

The remaining cost on a cold cache is the static import graph: `form.js`, `da-lit`, `getPathDetails`, `da-title`, the three UI components, `utils/styles.js`, and the per-component stylesheets (`shell.css`, `editor.css`, `sidebar.css`, `preview.css`). ~10 requests for the loading screen, all parallelizable over HTTP/2.

### 2.2. Single keystroke (the most-frequent path)

After the per-pointer 350 ms debounce, `editor.js → core.setField(pointer, value) → onMutate()`. What runs:

```txt
core.setField(pointer, value)
  └─ commit(applySet({...}))
       ├─ applySet → deepClone(document)        ← clone #1
       ├─ rebuildModel(nextDoc)
       │    ├─ buildModel
       │    │    ├─ deepClone(document)          ← clone #2
       │    │    └─ traverse(definition, doc)    ← O(N) build tree + byPointer Map
       │    └─ validateDocument                  ← O(N) traverse
       └─ persist()
            └─ deepClone(state.document.values)  ← clone #3
            └─ saveDocument({ path, document })   ← HTTP POST (async, not awaited)

onMutate() → shell sets _state = core.getState()
  └─ Lit re-renders <sc-form>
       ├─ <sc-editor>.state ←  new ref → re-render entire form tree (O(N) JS work)
       ├─ <sc-sidebar>.state ← new ref → re-render entire nav tree (O(N) JS work)
       └─ <sc-preview>.state ← new ref → JSON.stringify(doc) on every keystroke
```

**Per-keystroke cost summary** (N = number of fields, D = document byte size):

| Step | Cost | Where |
|---|---|---|
| 3× deep clone of full document | 3× O(D) | mutate.js, model.js, index.js |
| Rebuild model tree + byPointer Map | O(N) | model.js |
| Validate document | O(N) | validation.js |
| Editor template build | O(N) | editor.js render |
| Sidebar template build | O(N_structural) | sidebar.js render |
| Preview JSON.stringify + DOM update | O(D) | preview.js render |
| HTTP POST (background, fire-and-forget) | network | da-api.js |

For a typical 50-field doc this is < 5 ms total. For a 500-field doc it's ~30 ms — already past the 16 ms frame budget. For a 5000-field doc it's hundreds of ms and the form will feel laggy on every save burst.

### 2.3. Add/remove/reorder array item

Same hot path as setField, plus:
- `buildModel` has to run `assignArrayItemIds` over the array (O(items²) in the worst case due to the signature multiset check, but in practice the linear positional path is taken).
- Reorder triggers `_reorderConfirmed`, which in `editor.updated()` resets local reorder state — one extra render.

### 2.4. Navigation (selection)

Cheap: `_onSelect(pointer, origin)` creates a new `_nav` object. State doesn't change.

```txt
_nav = { pointer, origin, seq: prev.seq + 1 }
  └─ Editor.updated() detects nav change, may scrollIntoView
  └─ Sidebar.updated() detects nav change, may scrollIntoView
```

Both `updated()` callbacks bail early unless origin matches. Then `scrollIntoView` runs. Cheap.

### 2.5. Hash change (route to a different doc)

The shell's `hashchange` listener calls `setup(el)` which `replaceChildren()` and re-creates everything. This is heavy — *the same as initial load*. We lose all cached state for the same domain.

---

## 3. Bottlenecks, ranked

### Critical — affects typing felt as smooth

**[C1] Preview re-renders `JSON.stringify` on every keystroke**
[ui/preview.js:20](nx/blocks/form/ui/preview.js:20)

```js
const text = JSON.stringify(json ?? {}, null, 2);
```

`JSON.stringify` on a 50 KB doc is ~0.5 ms, on 500 KB it's ~10 ms. Plus the `<pre><code>${text}</code></pre>` text-node update which Lit treats as a full text-content replacement. For any doc bigger than trivial, this dominates per-keystroke cost — and the user can't actually read changes that fast.

**Fix:** debounce the preview separately (e.g. 250 ms after typing stops), or only re-render on save success, or only when the `<pre>` is in the viewport (IntersectionObserver). My recommendation is "render on save success" — preview becomes a confirmation rather than a live mirror.

**[C2] Three deep clones per mutation**
[core/mutate.js:31](nx/blocks/form/core/mutate.js:31), [core/model.js:97](nx/blocks/form/core/model.js:97), [core/index.js:92](nx/blocks/form/core/index.js:92)

Per `setField`:
1. `mutate.js` clones the doc before applying the change.
2. `model.js buildModel` clones again as `normalizedDoc`.
3. `core/index.js persist()` clones a third time before passing to `saveDocument`.

**Fix:** the second clone is redundant — `mutate.js` already produced a fresh doc that no other code holds. Drop `buildModel`'s clone. The third clone is defensive against `saveDocument` mutating the doc; for the current `saveDocument` (which just serializes), it's unneeded. Drop it too. Net: 1 clone per mutation instead of 3.

Concretely: change [model.js:97](nx/blocks/form/core/model.js:97) to assume input is owned, and change [index.js:92](nx/blocks/form/core/index.js:92) to pass the value directly. Add a one-line comment at each boundary that "input is owned, do not mutate" so the contract is visible.

### High — affects large-doc scaling

**[H1] Sidebar re-renders on every value change but only depends on tree shape**
[ui/sidebar.js:80](nx/blocks/form/ui/sidebar.js:80)

The sidebar renders the same `<button>` per node regardless of what value the node holds. Yet every `setField` triggers a sidebar re-render because `state` (its prop) changes by reference.

For a 100-item array, this is ~100 unnecessary Lit template invocations per keystroke. Wasted JS work; the resulting DOM diff is a no-op.

**Fix:** add `shouldUpdate(changed)` to skip re-renders when only `state.document` changed but not `state.model.root`. Concretely:

```js
shouldUpdate(changed) {
  if (changed.has('nav')) return true;
  const next = this.state?.model?.root;
  const prev = changed.get('state')?.model?.root;
  return next !== prev;
}
```

`buildModel` always returns a new `root` when the tree shape changes (new array items, removed items) — but actually it returns a new `root` on *every* call because `buildModel` always returns new objects. So the cheap check above won't help directly.

**Fix variant:** in `buildModel`, return the *same* `root` reference when the subtree is structurally identical (same children/items arrays by identity). That makes the sidebar's `shouldUpdate` work. This is a larger change but pays off everywhere.

**[H2] Editor renders the entire tree on every keystroke**
[ui/editor.js:423](nx/blocks/form/ui/editor.js:423)

Same root issue as the sidebar. Lit's template caching makes the DOM diff cheap for unchanged nodes, but the JS work to build the template tree is O(N). For 1000+ fields this measurably slows down typing.

**Fix:** split the editor into per-field components — each is a small `LitElement` that only re-renders when its own node changes. Then Lit's reactive boundary stops at each field. This is significant work; not worth doing until users hit it. Worth profiling first to confirm.

**[H3] Validation runs the entire schema tree on every mutation**
[core/validation.js:163](nx/blocks/form/core/validation.js:163)

`validateDocument` walks the entire model. Per-field rules (minLength, pattern, etc.) only depend on a single node's value — no cross-field rules exist in the current schema features. A single-field change should only re-validate that field.

**Fix:** add `validateField({ node, errorsByPointer })` and call it from `setField` to update only that pointer's entry. Drop full-tree validation to load + array mutations only. Net: O(1) per keystroke instead of O(N).

**[H4] Hash-change tears down everything**
[form.js:399](nx/blocks/form/form.js:399)

```js
window.addEventListener('hashchange', () => { setup(el); });
```

`setup` does `el.replaceChildren()` and recreates `da-title` + the form. For a hash change *within the same document* (e.g. anchor navigation, query-param tweak) we lose all state.

**Fix:** compare the new path to the current one and only re-setup when the document actually changes. Sub-fix: if only query params changed (e.g. `?nx=branch`), update them in place.

### Medium — adds up over a session

**[M1] `assignArrayItemIds` runs `toSignature` over every item even when not reordering**
[core/ids.js:60](nx/blocks/form/core/ids.js:60)

The signature is `JSON.stringify`-equivalent serialization of every array item — expensive for large or nested items.

**Fix:** in `buildModel`, check first whether `previousItems === nextItems` by reference (since `mutate.js` only creates new arrays when needed) and short-circuit. For setField that doesn't touch arrays, `previousItems` and `nextItems` would be *different references* because the doc was deep-cloned — so this won't help in our current cloning regime. Resolving C2 (drop redundant clones) and using structural sharing in `mutate.js` would unlock this.

**[M2] Save POST on every debounced burst**

A fast typist generates one POST per ~350 ms. Most are obsolete by the time they arrive. With network jitter, an earlier save can land after a later one — silent overwrite. The earlier review noted save sequencing was deleted; we deferred the consequence.

**Fix (correctness, not perf):** when a save is in flight, mark a `dirty` flag and re-save on completion. Avoids redundant in-flight saves and prevents stale overwrites. Roughly:

```js
let inFlight = false;
let pending = false;
async function persist() {
  if (inFlight) { pending = true; return; }
  inFlight = true;
  do {
    pending = false;
    await saveDocument({ path, document: deepClone(state.document.values) });
  } while (pending);
  inFlight = false;
}
```

### Low — measure before optimizing

**[L1] `getStyle` may or may not cache constructed stylesheets**
The `utils/styles.js` helper is shared. If it doesn't memoize per URL, every editor instance creates a new `CSSStyleSheet`. Verify, not assume.

**[L2] `byPointer` Map is rebuilt fresh every time**
For the current sizes (< 1000 fields), the cost is negligible. Worth revisiting only if N grows.

**[L3] `schemaCache` in [app/schemas.js:6](nx/blocks/form/app/schemas.js:6) never invalidates**
Stale schemas survive until full reload. Memory bound is small (per `owner/repo` combo). Document staleness is the real concern, not perf.

**[L4] `JSON.parse(JSON.stringify(...))` fallback in `deepClone`**
The fallback path is slower than `structuredClone` and is only used when the latter is unavailable. Modern browsers have `structuredClone` — the fallback is effectively dead in supported targets. Could be deleted.

---

## 4. Reactivity analysis

### 4.1. Lit property update graph

```
<sc-form>
  state ← changes on every mutation
  nav   ← changes on every selection
  _context, _pendingSchemaId ← change on context load / schema picker
```
each is a reactive property. Any change schedules an `updated()` cycle.

```
<sc-editor>
  core      ← changes once per load
  state     ← changes every mutation
  nav       ← changes every selection
  onMutate  ← stable
  onSelect  ← stable

<sc-sidebar>
  state     ← changes every mutation
  nav       ← changes every selection
  onSelect  ← stable

<sc-preview>
  state     ← changes every mutation
```

The callbacks are arrow-fn properties bound in the shell's constructor, so they have stable identity across renders. ✅ No spurious re-renders on that axis.

But every mutation propagates a new `state` reference to all three children. All three re-render. **Editor and Preview legitimately need to** (values changed). **Sidebar doesn't** (structure usually unchanged).

### 4.2. Where reactivity is correct

- ✅ The shell stores `_state` and `_nav` as Lit reactive `{ state: true }` properties — no manual `requestUpdate()` needed.
- ✅ Mutation no-ops return the same `state` reference (core's `commit` returns `state` unchanged when `mutationResult.changed` is false), so Lit's `===` check skips the re-render.
- ✅ `onMutate` and `onSelect` arrow-fns are stable refs — passed as `.onMutate=` and `.onSelect=` they don't churn.
- ✅ `editor.updated()` correctly uses `changed.get('nav')` to access the previous value — the standard Lit pattern.
- ✅ Disposal: editor clears `_inputTimers` in `disconnectedCallback`. Reorder dialog removes its `document` keydown listener. Array menu removes its peer-event and click-outside listeners.

### 4.3. Where reactivity is wasteful

- ❌ The whole tree re-renders on every keystroke. Lit's template caching keeps DOM updates minimal, but the per-render JS work is O(tree size). For large forms this is the main hot spot. See **[H1], [H2]**.
- ❌ Preview re-renders on every keystroke despite the user being unable to consume the change at typing speed. See **[C1]**.
- ❌ Hash change in any form (even unrelated) tears down the editor. See **[H4]**.

### 4.4. Where reactivity is subtly wrong

- ⚠️ `_inputTimers` in the editor is *instance state*, not a reactive property. That's correct — debounce timers should not trigger re-renders. But note: if the editor instance is disconnected and reconnected (e.g. moved in the DOM), timers survive disconnect (we clear on disconnect) but a pending mutation may still fire after a `core` rebind. Today `core` is set once per load, so this is fine in practice. If we ever lazy-instantiate cores per route, this becomes a use-after-free hazard. Worth a `_inputTimers.clear()` in the `core` property setter or a guard in the timer body.
- ⚠️ The sidebar's `scrollIntoView` runs inside `updated()` synchronously. If the editor is also scrolling at the same frame, two scroll triggers can interleave awkwardly. Visible only on slow machines.

---

## 5. Recommended optimizations, prioritized

The "do these now" set, in order:

1. **[C2] Cut two of the three deep clones per mutation.** Easiest large win. ~1 hour of work, no API change, measurable.
2. **[C1] Stop re-rendering Preview on every keystroke.** Move to "render on save" or debounced separately. One render path change, no API change.
3. **[H3] Per-field incremental validation.** Add `validateField`, call from `setField`. Keep full `validateDocument` for `load` and array mutations. Most of the saved work shows up on big forms.
4. **[M2] Single-flight save with re-queue.** Correctness + perf fix combined.
5. **[H4] Skip hash-change teardown when the document hasn't changed.** Compare paths first.

The "consider later, profile first" set:

6. **[H1] / [H2]** Sidebar/editor partial re-rendering. Significant refactor; only worth it when a real form crosses the threshold. Measure on the largest production schema before committing.
7. **Structural sharing in `buildModel`.** Return identity-stable `root` when only leaf values changed. Unlocks `shouldUpdate` checks.

The "leave alone" set:

8. `byPointer` rebuild — O(N) is fine when N is small.
9. The `JSON.parse(JSON.stringify(...))` fallback in `deepClone` — dead code but harmless.
10. `getStyle` semantics — verify if curious but don't preempt.

---

## 6. What is NOT a performance concern

- **Element registration / Lit lifecycle** — overhead is one-time and small.
- **The debounce** — 350 ms is a UX choice, not a performance choice. Reducing it would *worsen* per-keystroke cost.
- **The vendored `html2json` / `json2html`** — both are linear in doc size and only invoked at load + save boundaries (well outside the typing hot path).
- **JSON Pointer parsing in `pointer.js`** — O(segments) and pointers are short.
- **Validation regex compilation** — done per-validation today; if [H3] is implemented, regex compile could be hoisted to schema compile.

---

## 7. Benchmarks to set up

Before optimizing further, get numbers. Suggested micro-benchmarks (none exist today):

1. **Per-keystroke pipeline**, end-to-end (`setField` → render committed) — measure on docs of 10, 100, 1000, 5000 fields.
2. **Cold module load** — `performance.now()` from `init()` call to first paint of the spinner.
3. **`core.load` time** — from call to returned state, on the same dataset sizes.
4. **Preview render time alone** — isolate `JSON.stringify` + DOM update cost from the rest of the per-keystroke pipeline.

A simple `bench/` folder with a Node-runnable harness (the core is headless) would catch regressions before they reach users.
