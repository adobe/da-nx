# Form — Performance Review

A walk through the hot paths, the bottlenecks they expose, and how reactive updates flow through the Lit tree. Recommendations at the bottom are prioritized; pick what's worth the maintenance cost.

---

## 1. What "fast enough" should mean here

This block is an editor for human-authored structured content. The performance envelope is:

| Dimension      | Realistic worst case                                                                              | Budget                                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Document size  | 50–200 KB JSON, ~50–500 fields                                                                    | Operations on the doc are O(size) and run on a keystroke — they must stay under ~16 ms to keep typing at 60 fps.                                                                                                                     |
| Schema size    | < 100 KB, < 1000 properties total after `$ref` resolution                                         | Compile happens once per load — budget ~100 ms.                                                                                                                                                                                      |
| Initial load   | First meaningful paint (either the editor on a warm cache, or one of the explicit status screens) | < 200 ms after the block module starts. The transient loading state renders nothing — no spinner, no "preparing…" message.                                                                                                           |
| Time-to-edit   | From `init(el)` to a working editor                                                               | < 1 s on a warm cache, < 2 s cold.                                                                                                                                                                                                   |
| Save latency   | After typing stops                                                                                | One round-trip per debounced burst; debounce 350 ms.                                                                                                                                                                                 |
| Typing latency | Keystroke → character visible                                                                     | Native input echo is immediate (the `<input>` value is uncontrolled in the React sense — we don't block the DOM). The mutation pipeline runs in the background after 350 ms. So typing should _feel_ instant regardless of doc size. |

Anything that pushes the per-keystroke pipeline past 16 ms on a representative doc is a real problem. Anything that pushes initial load past 1 s on a warm cache is a real problem.

---

## 2. Hot paths

### 2.1. Initial load

```txt
init(el)
  ├─ getPathDetails()                            sync
  ├─ create <da-title> + <nx-form>               sync
  └─ <nx-form> upgrades
       ├─ updated() sees details                 sync
       └─ _loadContext()
            ├─ status = 'loading' → render nothing
            ├─ loadFormContext({ details })       ← network
            │    ├─ loadSchemas (DA list + N source GETs)
            │    └─ fetchSourceHtml(details.sourceUrl)
            ├─ if ready:
            │    └─ _start({ schema, json })
            │         ├─ createEngine({ schema, document, onChange })   ← SDK; sync
            │         └─ attachPersistence(engine, { path })
            └─ status = 'ready' → render editor + sidebar + preview
```

The engine's init cost (schema compile + model build + validate + defaults materialization) is in the SDK and bounded by schema/doc size — typically a few ms; once per engine, never on the keystroke path. See [SDK lifecycle.md §1](https://github.com/adobe-rnd/da-sc-sdk/blob/main/docs/lifecycle.md#1-createengine-lifecycle) for the full call flow and [SDK architecture.md §10](https://github.com/adobe-rnd/da-sc-sdk/blob/main/docs/architecture.md) for the defaults-materialization policy.

**Blocking before first paint:**

The shell module awaits the shared `utils/styles.js` helper and the shell stylesheet before the element is declared. Each UI module also awaits its own stylesheet load at module top. `sl/components` is dynamic-imported inside `_loadContext` for every non-blocked status (editor, schema picker, "no schemas" CTA — they all paint SL fields). `array-menu` and `reorder` are dynamic-imported from the editor's `firstUpdated`. The transient loading state renders nothing, so none of these imports gate first paint.

The remaining cost on a cold cache is the static import graph: `form.js`, `da-lit`, `getPathDetails`, `da-title`, the three UI components, `utils/styles.js`, and the per-component stylesheets (`form.css`, `editor.css`, `sidebar.css`, `preview.css`). ~10 requests for the loading screen, all parallelizable over HTTP/2.

### 2.2. Single keystroke (the most-frequent path)

After the per-pointer 350 ms debounce, `editor.js` calls `engine.setField(pointer, value)`. What runs in the form block:

```txt
engine.setField(pointer, value)   ← SDK commits new state + fires onChange
  └─ shell._onChange()
       ├─ this._state = engine.getState()
       │    → Lit re-renders <nx-form>
       │       ├─ <nx-editor>.state ←  new ref → re-render entire form tree (O(N) JS work)
       │       ├─ <nx-sidebar>.state ← new ref → re-render entire nav tree (O(N) JS work)
       │       └─ <nx-preview>.state ← new ref → render is cheap; preview repaints imperatively after a 500 ms debounce
       └─ persistence.notify()
            └─ convertJsonToHtml + POST  ← HTTP, fire-and-forget, not awaited
```

**Per-keystroke cost summary, form-block side** (N = number of fields, D = document byte size):

| Step                                                                             | Cost                                  | Where                                  |
| -------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------- |
| Editor template build                                                            | O(N)                                  | views/editor.js                        |
| Sidebar template build                                                           | O(N_structural)                       | views/sidebar.js                       |
| Preview render (cached text; stringify itself runs once per 500 ms quiet period) | O(1) per keystroke, O(D) per debounce | views/preview.js                       |
| HTTP POST (background, fire-and-forget)                                          | network                               | utils/persistence.js + utils/da-api.js |

**Plus the SDK's side of the per-keystroke cost** (deep-clone the document, rebuild the model, validate) — these are inside `engine.setField` and detailed in [SDK lifecycle.md §2](https://github.com/adobe-rnd/da-sc-sdk/blob/main/docs/lifecycle.md#2-mutation-lifecycle) (call flow) and [§4](https://github.com/adobe-rnd/da-sc-sdk/blob/main/docs/lifecycle.md#4-cost-characteristics) (cost table). The SDK side is also O(N+D) per keystroke.

For a typical 50-field doc the whole pipeline is < 5 ms total. For a 500-field doc it's ~20 ms — past the 16 ms frame budget. For a 5000-field doc it's hundreds of ms and the form will feel laggy on every save burst. Both the form block (Lit re-render) and the SDK (validate + clone) contribute roughly equally at scale.

### 2.3. Add/remove/reorder array item

Same hot path as setField. Reorder also triggers `_reorderConfirmed`, which in `editor.updated()` resets local reorder state — one extra render.

### 2.4. Navigation (selection)

Cheap: `_onSelect(pointer, origin)` creates a new `_nav` object. State doesn't change.

```txt
_nav = { pointer, origin, seq: prev.seq + 1 }
  └─ Editor.updated() detects nav change, may scrollIntoView
  └─ Sidebar.updated() detects nav change, may scrollIntoView
```

Both `updated()` callbacks bail early unless origin matches. Then `scrollIntoView` runs. Cheap.

### 2.5. Hash change (route to a different doc)

The shell's `hashchange` listener calls `setup(el)` which `replaceChildren()` and re-creates everything. This is heavy — _the same as initial load_. We lose all cached state for the same domain.

---

## 3. Bottlenecks, ranked

### High — affects large-doc scaling

**[H1] Sidebar re-renders on every value change but only depends on tree shape**
[views/sidebar.js:80](nx/blocks/form/views/sidebar.js:80)

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

This is currently ineffective because the SDK's `buildModel` returns a new `root` on every call. A complementary fix on the SDK side — structural sharing in `buildModel` that returns identity-stable `root` when only leaf values changed — would unlock this check. That fix lives in the SDK; the form block's `shouldUpdate` is the consumer-side half.

**[H2] Editor renders the entire tree on every keystroke**
[views/editor.js:423](nx/blocks/form/views/editor.js:423)

Same root issue as the sidebar. Lit's template caching makes the DOM diff cheap for unchanged nodes, but the JS work to build the template tree is O(N). For 1000+ fields this measurably slows down typing.

**Fix:** split the editor into per-field components — each is a small `LitElement` that only re-renders when its own node changes. Then Lit's reactive boundary stops at each field. This is significant work; not worth doing until users hit it. Worth profiling first to confirm.

**[H3] Validation runs the entire document on every mutation** _(SDK concern)_

The SDK re-validates the full document after every mutation; cost scales with document size and schema complexity. This is a deliberate SDK design choice — per-field incremental validation is unsafe in the general case because JSON Schema supports cross-field rules (`anyOf`, `oneOf`, `dependentRequired`, `dependentSchemas`, `if`/`then`/`else`) where one field can flip the validity of another.

If a profile ever shows validation latency dominating on a real form, the fix lives in the SDK (gate a fast-path on "schema declares no composition / dependent keywords," or accept the full pass and look elsewhere first). See [SDK architecture.md §8](https://github.com/adobe-rnd/da-sc-sdk/blob/main/docs/architecture.md) for the engine's validation pipeline.

**[H4] Hash-change tears down everything**
[form.js:399](nx/blocks/form/form.js:399)

```js
window.addEventListener("hashchange", () => {
  setup(el);
});
```

`setup` does `el.replaceChildren()` and recreates `da-title` + the form. For a hash change _within the same document_ (e.g. anchor navigation, query-param tweak) we lose all state.

**Fix:** compare the new path to the current one and only re-setup when the document actually changes. Sub-fix: if only query params changed (e.g. `?nx=branch`), update them in place.

### Medium — adds up over a session

**[M1] Save POST on every debounced burst** — _implemented_. The form block's `utils/persistence.js` is single-flight with re-queue (see [request-flow.md §4](./request-flow.md)). At most one POST in flight at a time; new mutations during a save flip `pending` and the loop re-iterates with the latest `engine.getState().document`. An earlier POST cannot land after a newer one. Contract verified by [persistence.test.js](../../../../test/nx/blocks/form/utils/persistence.test.js).

### Low — measure before optimizing

**[L1] `getStyle` may or may not cache constructed stylesheets**
The `utils/styles.js` helper is shared. If it doesn't memoize per URL, every editor instance creates a new `CSSStyleSheet`. Verify, not assume.

**[L2] `byPointer` map is rebuilt fresh every time** _(SDK concern)_
For the current sizes (< 1000 fields), the cost is negligible. Worth revisiting only if N grows; fix lives in the SDK.

**[L3] `schemaCache` in [utils/schemas.js:6](nx/blocks/form/utils/schemas.js:6) never invalidates**
Stale schemas survive until full reload. Memory bound is small (per `owner/repo` combo). Document staleness is the real concern, not perf.

**[L4] `deepClone` fallback path** _(SDK concern)_
The SDK's `deepClone` falls back to `JSON.parse(JSON.stringify(...))` when `structuredClone` is unavailable. Modern targets always have `structuredClone` — the fallback is effectively dead. Could be deleted on the SDK side.

---

## 4. Reactivity analysis

### 4.1. Lit property update graph

```
<nx-form>
  state ← changes on every mutation
  nav   ← changes on every selection
  _context, _pendingSchemaId ← change on context load / schema picker
```

each is a reactive property. Any change schedules an `updated()` cycle.

```
<nx-editor>
  editor    ← engine handle; changes once per _start
  state     ← changes every mutation
  nav       ← changes every selection
  onSelect  ← stable

<nx-sidebar>
  state     ← changes every mutation
  nav       ← changes every selection
  onSelect  ← stable

<nx-preview>
  state     ← changes every mutation
```

The callbacks are arrow-fn properties bound in the shell's constructor, so they have stable identity across renders. ✅ No spurious re-renders on that axis.

But every mutation propagates a new `state` reference to all three children. All three re-render. **Editor and Preview legitimately need to** (values changed). **Sidebar doesn't** (structure usually unchanged).

### 4.2. Where reactivity is correct

- ✅ The shell stores `_state` and `_nav` as Lit reactive `{ state: true }` properties — no manual `requestUpdate()` needed.
- ✅ Mutation no-ops return the same `state` reference (the engine returns its state unchanged when nothing changed), so Lit's `===` check skips the re-render. SDK behavior; see [SDK lifecycle.md §2](https://github.com/adobe-rnd/da-sc-sdk/blob/main/docs/lifecycle.md#2-mutation-lifecycle).
- ✅ `onSelect` arrow-fn is a stable ref — passed as `.onSelect=` it doesn't churn. State notifications use the engine's `onChange` (one callback wired in `_start`) instead of a separate `onMutate` prop on every child.
- ✅ `editor.updated()` correctly uses `changed.get('nav')` to access the previous value — the standard Lit pattern.
- ✅ Disposal: editor clears `_inputTimers` in `disconnectedCallback`. Reorder dialog removes its `document` keydown listener. Array menu removes its peer-event and click-outside listeners.

### 4.3. Where reactivity is wasteful

- ❌ The whole tree re-renders on every keystroke. Lit's template caching keeps DOM updates minimal, but the per-render JS work is O(tree size). For large forms this is the main hot spot. See **[H1], [H2]**.
- ❌ Hash change in any form (even unrelated) tears down the editor. See **[H4]**.

### 4.4. Where reactivity is subtly wrong

- ⚠️ `_inputTimers` in the editor is _instance state_, not a reactive property. That's correct — debounce timers should not trigger re-renders. But note: if the editor instance is disconnected and reconnected (e.g. moved in the DOM), timers survive disconnect (we clear on disconnect) but a pending mutation may still fire after the engine handle is rebound. Today the engine is created once per `_start`, so this is fine in practice. If we ever lazy-instantiate engines per route, this becomes a use-after-free hazard. Worth a `_inputTimers.clear()` in the `editor` property setter or a guard in the timer body.
- ⚠️ The sidebar's `scrollIntoView` runs inside `updated()` synchronously. If the editor is also scrolling at the same frame, two scroll triggers can interleave awkwardly. Visible only on slow machines.

---

## 5. Recommended optimizations, prioritized

The "do these now" set, in order:

1. **[H4] Skip hash-change teardown when the document hasn't changed.** Compare paths first.

The "consider later, profile first" set:

2. **[H1] / [H2]** Sidebar/editor partial re-rendering. Significant refactor; only worth it when a real form crosses the threshold. Measure on the largest production schema before committing.
3. **Structural sharing in `buildModel`** _(SDK fix)_. Return identity-stable `root` when only leaf values changed. Unlocks the form block's `shouldUpdate` checks for free. Lives in the SDK; the form block can't fix it alone.

The "leave alone" set:

4. `byPointer` rebuild _(SDK)_ — O(N) is fine when N is small.
5. `deepClone` fallback _(SDK)_ — dead code but harmless.
6. `getStyle` semantics — verify if curious but don't preempt.

---

## 6. What is NOT a performance concern

- **Element registration / Lit lifecycle** — overhead is one-time and small.
- **The debounce** — 350 ms is a UX choice, not a performance choice. Reducing it would _worsen_ per-keystroke cost.
- **The vendored `html2json` / `json2html`** — both are linear in doc size and only invoked at load + save boundaries (well outside the typing hot path).
- **JSON Pointer parsing in `pointer.js`** — O(segments) and pointers are short.
- **Validation regex compilation** — handled inside the schema validator; not on the typing hot path in any way that warrants intervention today.

---

## 7. Benchmarks to set up

Before optimizing further, get numbers. Suggested micro-benchmarks (none exist today):

1. **Per-keystroke pipeline**, end-to-end (`setField` → render committed) — measure on docs of 10, 100, 1000, 5000 fields. Separates form-block render cost from SDK commit cost.
2. **Cold module load** — `performance.now()` from `init()` call to first meaningful paint (editor or status screen).
3. **`createEngine` time** — from call to returned engine, on the same dataset sizes. (Owned by the SDK; benchmark belongs in the SDK's repo.)
4. **Preview render time alone** — isolate `JSON.stringify` + DOM update cost from the rest of the per-keystroke pipeline.

A simple `bench/` folder with a Node-runnable harness (the SDK engine is headless) would catch regressions before they reach users.
