# Form — Request flow

How a request moves through the block.

---

## 1. Initial load

From `init(el)` to a rendered editor (or a status screen).

```txt
init(el)
  ├─ getPathDetails()                            sync
  ├─ create <da-title> + <sc-form>               sync
  └─ <sc-form> upgrades
       ├─ connectedCallback → adoptedStyleSheets sync
       ├─ updated(changed) sees `details`        sync
       └─ _loadContext()
            ├─ status = 'loading' → spinner
            ├─ loadFormContext({ details })      ← network
            │    ├─ loadSchemas({ owner, repo })     ← DA list + N source GETs
            │    └─ fetchSourceHtml({ sourceUrl })    ← single GET
            ├─ Route by status:
            │    ├─ 'blocked'        → loadBlockedDeps()    (lazy da-dialog)
            │    ├─ 'select-schema'  → loadSchemaPickerDeps() (lazy sl/components)
            │    ├─ 'no-schemas'     → loadSchemaPickerDeps()
            │    └─ 'ready'          → _start({ schema, json })
            └─ _start
                 └─ createCore({ path, saveDocument, onChange })
                      └─ core.load({ schema, document })
                           ├─ compileSchema(schema)             ← CPU
                           ├─ parseDocument(document)           ← deep clone
                           ├─ if isDataEmpty(parsed.data):
                           │    └─ materializeDefaults(definition)  ← O(schema)
                           └─ rebuildModel(parsed)
                                ├─ buildModel                   ← tree walk + byPointer Map
                                └─ validateDocument             ← schema validation + model walk
       → render editor + sidebar + preview
```

**Context routing.** [`loadFormContext`](nx/blocks/form/app/context.js) consults the loaded HTML in this order:

| Condition                         | Resulting status            | UI                     |
| --------------------------------- | --------------------------- | ---------------------- |
| `details` is not an HTML resource | `blocked: not-document`     | "Unsupported resource" |
| Source GET fails 401/403          | `blocked: no-access`        | "No access"            |
| Source GET fails 404              | `blocked: not-document`     | "Unsupported resource" |
| Source GET fails other            | `blocked: load-failed`      | "Couldn't open"        |
| HTML is empty AND schemas exist   | `select-schema`             | Schema picker          |
| HTML is empty AND no schemas      | `no-schemas`                | "Create a schema" CTA  |
| HTML is not structured content    | `blocked: not-form-content` | "Unsupported resource" |
| HTML has unknown `schemaName`     | `blocked: missing-schema`   | "Schema not found"     |
| Otherwise                         | `ready`                     | Editor                 |

**What's lazy.** `da-dialog`, `sl/components`, `array-menu`, and `reorder` modules import only when the route or action that needs them is reached. They do not gate the spinner.

---

## 2. Text input (the most frequent path)

Single keystroke into a text or number `<input>`.

```txt
DOM <input> @input
  └─ editor._onTextInput(node, e)
       └─ editor._mutateDebounced(pointer, fn)        ← 350ms per-pointer timer
            └─ [350ms later]
                 └─ editor._mutate(fn)
                      └─ fn(core) → core.setField(pointer, value)
                           ├─ canMutate?                  ← guard
                           ├─ nodeAt({ model, pointer })  ← Map lookup
                           ├─ readonly?                   ← guard
                           └─ commit(applySet({...}))
                                ├─ applySet (mutate.js)
                                │    ├─ deepClone(document)
                                │    ├─ shouldClear?
                                │    │   ├─ yes: clearValueAt
                                │    │   └─ no:  setValueAt
                                │    └─ return { document, changed }
                                ├─ if !changed: return state (no-op)
                                ├─ rebuildModel(nextDoc)
                                │    ├─ buildModel              ← O(N) tree walk
                                │    ├─ validateDocument        ← schema validation + O(N) model walk
                                │    └─ commitState(next)       → onChange()
                                │         └─ shell._state = core.getState()
                                │              → Lit re-renders form tree
                                └─ persist()  (fire-and-forget — see §4)
```

**Why debounced.** Native `<input>` value echo is immediate; the model/validation/save pipeline runs in the background after 350ms of quiet. Typing always feels instant regardless of document size.

---

## 3. Boolean / select / button action (immediate)

Toggle a checkbox, change a select, or click an array action.

```txt
DOM @change or @click
  └─ editor._onBooleanInput | _onSelectInput | array event handler
       └─ editor._mutate(fn)                    ← no debounce
            └─ fn(core) → core.setField | addItem | insertItem | removeItem | moveItem
                 └─ commit(applyXxx({...}))     ← same commit path as §2
                      └─ rebuildModel → onChange → re-render
                      └─ persist
```

Immediate because there is no per-keystroke noise to coalesce — a single discrete user action.

---

## 4. Save lifecycle

Triggered by every `commit` that reports `changed: true`.

```txt
commit({ document, changed: true })
  ├─ rebuildModel(...) → onChange (state with new values)
  └─ persist()  ← async, NOT awaited by commit
       │
       ├─ if inFlight:
       │    └─ pending = true; return
       │    (next branch will re-iterate using the latest state.document)
       │
       └─ inFlight = true
            ├─ patchState({ saveStatus: 'saving' })     → onChange
            └─ do {
                 pending = false
                 try {
                   result = await saveDocument({ path, document: state.document.values })
                     └─ shell.saveDocument
                          ├─ serialize({ json })            ← prune + json2html
                          │    ├─ prune(data)               ← strips empty/null
                          │    └─ json2html({ ...json, data: pruned })
                          └─ saveSourceHtml({ path, html }) ← POST /source{path}
                                └─ daFetch  (auth + retry handled here)
                 } catch { failed = true }
                 if result?.error or thrown:
                   patchState({ saveStatus: 'error' })  → onChange
                   return                                ← do-while exits
            } while (pending)
            ├─ patchState({ saveStatus: 'saved' })       → onChange
            └─ inFlight = false
```

### Key properties

- **Fire-and-forget at the mutation site.** `commit` returns synchronously. UI never waits on the network.
- **Single-flight.** At most one POST is in flight. New mutations during a save just flip `pending`.
- **Latest-wins.** When the in-flight save completes with `pending=true`, the loop iterates and POSTs `state.document.values` again — which now reflects every edit that happened during the wait. An earlier POST cannot land after a newer one.
- **Errors break the queue.** On error, `pending` is not honored; the next user edit starts a fresh save.
- **`load` clears `pending`.** A stale in-flight save from a previous document cannot trigger a resave of the new one.

---

## 5. Array operations

```txt
addItem → click "Add item" button
  └─ editor._mutate(core => core.addItem(arrayPointer))
       ├─ canAdd? (maxItems / readonly check)
       └─ commit(applyAdd({ document, pointer, itemDefinition }))
            ├─ applyAdd
            │    ├─ deepClone(document)
            │    ├─ ensureArray(...)
            │    ├─ buildDefault(itemDefinition) ← seeds defaults for new item
            │    └─ insertValueAt(end)
            └─ commit pipeline (see §2)

removeItem → array-menu "Remove"
  └─ canRemove? (minItems / readonly check)
  └─ commit(applyRemove(...))

moveItem  → reorder dialog confirm
  └─ canReorder? (length > 1 / readonly check)
  └─ commit(applyMove(...))   ← splice 1 out, splice in at target
```

Array-item identity is preserved across reorders by the stable-ID logic in [core/ids.js](nx/blocks/form/core/ids.js): the multiset-match heuristic detects pure reorders and reuses the previous IDs, so DOM nodes and focus survive the move.

---

## 6. Schema picker (empty document)

```txt
context.status === 'select-schema'
  └─ render <sl-select> + Create button
       └─ user picks a schema, clicks Create
            └─ form._applySelectedSchema()
                 ├─ build empty json: { metadata: { schemaName }, data: {} }
                 ├─ context = { ...context, status: 'ready', schema, json }
                 └─ _start({ schema, json })  ← same path as §1's _start
                      └─ core.load
                           └─ materializeDefaults runs (data is empty)
```

Result: an empty doc loaded with the picked schema, defaults already materialized, ready to type.

---

## 7. Hash change

```txt
window 'hashchange'
  └─ setup(el)
       ├─ el.replaceChildren()                      ← full teardown
       ├─ getPathDetails()                          ← new path
       └─ setDetails(...) for <da-title>, <sc-form>
            └─ <sc-form> upgrades → see §1
```

Full teardown and re-mount. Documented as a perf item in [PERFORMANCE-REVIEW.md §H4](nx/blocks/form/PERFORMANCE-REVIEW.md) — fix is a path comparison before tearing down. Not done because it doesn't bite at current usage.

---

## 8. State change notification

Every state mutation funnels through one of two helpers on the core:

```txt
commitState(next)                      patchState(partial)
  ├─ state = next                        ├─ state = { ...state, ...partial }
  └─ onChange?.()                        └─ onChange?.()
```

`onChange` is the single notification path. The shell wires it once in `_start`:

```js
this._onChange = () => {
  this._state = this._core.getState();
};
```

The shell's reactive Lit property `_state` triggers re-render. No `requestUpdate`, no events, no manual diffing — every state transition (mutation OR async save status) reaches the UI through the same one-line callback.

---

## Cross-references

- Detailed contracts and rules: [ARCHITECTURE.md](nx/blocks/form/ARCHITECTURE.md)
- Hot-path costs and ranked bottlenecks: [PERFORMANCE-REVIEW.md](nx/blocks/form/PERFORMANCE-REVIEW.md)
- Test coverage by area: [RATIONALE.md](nx/blocks/form/RATIONALE.md)
