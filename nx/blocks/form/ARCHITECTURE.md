# Form — Architecture

JSON Schema-driven structured content editor.

The block presents a JSON document for editing against a JSON Schema. A headless core owns canonical state, mutation, validation, and persistence; a thin Lit UI renders the model and calls into the core directly.

---

## 1. Layout

```txt
form/
  form.js             Lit shell: screen routing, context loading, mounts core
  core/
    index.js          createCore() — public API
    schema.js         resolveSchema + compileSchema (refs, allOf/oneOf/anyOf, definitions tree)
    model.js          buildModel + pointer→node Map, in one pass
    mutate.js         setField, addItem, insertItem, removeItem, moveItem
    pointer.js        RFC 6901 ops + definitionAt
    validation.js     validateDocument → { errorsByPointer }
    ids.js            stable array-item id assignment
    clone.js          single deepClone util
  app/
    context.js        loadFormContext — fetches doc HTML + schemas, routes to status
    da-api.js         fetch/save against DA source endpoints
    schemas.js        loadSchemas — schema discovery + module cache
    serialize.js      json → html via json2html
    html2json.js      vendored (to be moved out)
    json2html.js      vendored (to be moved out)
  ui/
    shell.css         shell layout (imports the others)
    editor.js/.css    field rendering + array rendering
    sidebar.js/.css   navigation
    preview.js/.css   read-only JSON preview
    array-menu.js/.css per-item actions
    reorder.js/.css   reorder dialog
```

---

## 2. Dependency direction

```txt
app/  →  core/
app/  →  ui/
ui/   →  core/
```

`core/` does not import from `ui/` or `app/`. `core/` has no Lit, no DOM, no browser dependency, and can be tested standalone.

---

## 3. Core API

```js
const core = createCore({ path, saveDocument, onChange });

const state = await core.load({ schema, document });    // async

const state = core.setField(pointer, value);            // sync
const state = core.addItem(pointer);                    // sync
const state = core.insertItem(pointer);                 // sync — insert before this pointer
const state = core.removeItem(pointer);                 // sync
const state = core.moveItem(pointer, fromIndex, toIndex); // sync

const state = core.getState();
```

`load` awaits schema/document parsing. All mutations are synchronous: they apply, schedule a save in the background, and return a state snapshot.

`onChange` is invoked whenever the state snapshot changes — after a mutation, when a save starts, and when it settles. The shell wires it to a method that pulls a fresh snapshot.

```js
state = {
  document:   { values },
  model:      { root, byPointer, document } | null,
  validation: { errorsByPointer },
  saveStatus: 'idle' | 'saving' | 'saved' | 'error',
}
```

---

## 4. UI wiring

The shell instantiates `core` with an `onChange` callback, holds the current state snapshot, and the navigation state. It passes `core` plus the selection callback to the children:

```js
<sc-editor
  .core=${this._core}
  .state=${this._state}
  .nav=${this._nav}
  .onSelect=${this._onSelect}
></sc-editor>

<sc-sidebar
  .state=${this._state}
  .nav=${this._nav}
  .onSelect=${this._onSelect}
></sc-sidebar>
```

Components call `core` directly (`core.setField(...)`, `core.addItem(...)`). They do not signal the shell — `core` calls its `onChange` callback after every state transition, and the shell pulls a fresh snapshot in response. This single notification path covers both mutations and asynchronous save-status changes. Selection changes go through `onSelect(pointer, origin)`.

Shell ↔ direct-child communication uses property bindings and callbacks. CustomEvents are used only for bubbled signals from nested components that cross a shadow root (e.g. `array-menu` → editor).

---

## 5. Navigation state

Lives in the shell only. Shape:

```js
nav = { pointer, origin, seq }
```

- `pointer` — RFC 6901 pointer of the focused field
- `origin` — `'editor' | 'sidebar' | null`. Drives scroll-sync: when origin is `'sidebar'`, the editor scrolls; when `'editor'`, the sidebar scrolls.
- `seq` — monotonic counter so re-selecting the same pointer still triggers scroll.

Components receive `nav` as a prop and call `onSelect(pointer, origin)` to update it.

---

## 6. Runtime model

`buildModel({ definition, document, previousModel })` produces:

```js
{
  root,        // node tree
  byPointer,   // Map<pointer, node>
  document,    // normalized doc
}
```

Nodes:

```js
{
  id,           // stable render key (UUID for array items, deterministic for the rest)
  key,
  kind,         // 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'unsupported'
  pointer,      // RFC 6901
  label,
  required, readonly,
  value,        // current value from document
  defaultValue, // schema default
  enumValues?,  // when present, renders as a select
  validation,   // schema rules picked from the compiled definition
  ui,           // { widget }
  // object: children: [...]
  // array:  items: [...], minItems, maxItems, itemLabel
  // unsupported: { unsupported: {...} }
}
```

The pointer→node Map is built during the same traversal that builds the tree — no follow-up pass.

When adding a new field type, add a new `kind` value to `schema.js`'s `inferKind` and handle it explicitly in `editor.js`. Never fall through to a default renderer.

---

## 7. Persistence

Persistence is immediate after every mutation. `core` calls `saveDocument({ path, document })` in the background — the mutation returns synchronously and the save settles later.

### Single-flight save with re-queue

At most one `saveDocument` call is in flight at a time. The pipeline:

1. A mutation lands → `commit` rebuilds the model → calls `persist()`.
2. If no save is in flight, `persist` flips `saveStatus` to `'saving'` and awaits `saveDocument`.
3. If a save *is* already in flight, `persist` sets `pending = true` and returns immediately. The in-flight call will re-iterate when it settles, using the *latest* document.
4. On success, `saveStatus` transitions to `'saved'`. On error or thrown rejection, `saveStatus` becomes `'error'` and the re-queue is dropped — the next user edit will start a fresh save.

This eliminates out-of-order overwrites on slow networks (an earlier POST landing after a later one) and collapses bursts of edits into a single trailing save.

### Status reporting

`saveStatus` lives on the state snapshot. `onChange` fires on every transition, so the shell renders the indicator without any separate observer. The shell's [`_renderSaveStatus`](nx/blocks/form/form.js) maps the four values to a small pill near the editor.

### `load` resets the queue

`load` sets `pending = false` so an in-flight save from a previous document cannot trigger a resave of the new one once it completes. `inFlight` is not reset — the previous save runs to completion against its captured document reference.

### What is still not handled

- **Error recovery** is left to the user: when `saveStatus === 'error'`, the user must edit something to retry. There is no automatic retry, no surfaced error detail beyond the pill, and no offline queue. If those become product requirements, extend `persist` with retry/backoff and surface the error message from the `saveDocument` result.
- **Concurrent editing** between sessions is not handled. Last writer wins.

---

## 8. Arrays

JSON Pointer is positional, so pointers change when items move.

- **Pointers** address fields in the document.
- **Stable IDs** (from `ids.js`) key array-item rendering across mutations.

`assignArrayItemIds` preserves an item's id when only ordering changed (the multiset of values is unchanged), so identical-content items keep their identity through a reorder.

---

## 9. Schema features

Resolved up front (in `schema.js`):

- `$ref` — internal refs only (`#/...`), with cycle protection.
- `allOf` — supported when single-entry; multiple entries are unsupported.
- `oneOf` / `anyOf` — unsupported (marked).

If any unsupported composition exists anywhere in the schema, `compileSchema` returns `editable: false` and the form is not rendered. A future refinement could render `unsupported` nodes inline while keeping the rest editable.

---

## 10. Input debouncing

Lives in `editor.js`, keyed per pointer, default 350ms. Boolean, select, and array mutations are immediate.

```js
_mutateDebounced(pointer, fn) {
  clearTimeout(this._inputTimers.get(pointer));
  this._inputTimers.set(pointer, setTimeout(() => {
    this._inputTimers.delete(pointer);
    fn(this.core);
    this.onMutate?.();
  }, DEBOUNCE_MS));
}
```

Note: a navigation away within the debounce window currently drops the last keystroke. Address with a `beforeunload` flush if it becomes a problem.

---

## 11. Defaults policy

Schema `default` values are **materialized into the document at load time** when the loaded `data` is empty. From that point on, defaults are real values in the document — they are saved on the first mutation, and the renderer is a pure function of `node.value` with no special case for defaults.

### The three invariants

| Stage | Rule |
|---|---|
| **Load** | If `isDataEmpty(parsed.data)` → write schema defaults into `data` (recursively). A primitive with an explicit `default` materializes to that value. A boolean without an explicit default materializes to `false`. Other primitives without a default stay absent. Otherwise leave `data` alone. |
| **Render** | Show `node.value`. If `undefined`, show empty (or `false` for boolean). The renderer never reads `node.defaultValue`. |
| **Save** | Prune empty strings / null / undefined / whitespace-only / empty branches from `data`, then serialize. `false` is **not** pruned. |

`isDataEmpty` and `prune` mirror each other on purpose: a value the loader treats as "empty enough to materialize over" is exactly a value the saver would strip. If one definition changes, the other must too — covered by the symmetry tests in `test/form/core/index.test.js`.

### Why booleans get an implicit default

A boolean field has exactly two visible states (checked, unchecked); there is no meaningful "absent." If a fresh document renders a checkbox as unchecked, the saved document must reflect that — otherwise the next load sees an empty doc, re-materializes, and the checkbox state is whatever the schema's default says, not what the user saw.

Materializing `false` for booleans without an explicit default makes the round-trip stable:

- `false` survives `prune()` on save (only empty strings, null, undefined, whitespace, and empty branches are stripped — `false` is real).
- A saved document containing `{ flag: false }` is not `isDataEmpty`, so the next load does not re-materialize and the checkbox stays unchecked.
- This pattern only applies to booleans. For other primitives, materializing an empty placeholder (`''`, `0`, `null`) would be stripped on save anyway — pointless writes. Booleans are the only primitive where the natural "empty" state is itself a persistable value.

### Field-level rendering

What a single input shows, given what's in the document for that field:

| `node.value` after load | Rendered |
|---|---|
| `"hello"` | `"hello"` |
| `""` | empty |
| `undefined` (key missing) | empty |
| `false` (boolean) | unchecked |
| `true` | checked |
| `undefined` (boolean) | unchecked |

### End-to-end scenarios

Schema for all rows: `{ A: { type: string, default: "X" }, B: { type: string, default: "Y" }, C: { type: string } }` (C has no default).

| # | Disk before | At load `isDataEmpty?` | In-memory `data` after load | What user sees | User action | In-memory `data` after action | Disk after save |
|---|---|---|---|---|---|---|---|
| 1 | empty | yes → materialize | `{A:"X", B:"Y"}` | A="X", B="Y", C=empty | nothing | `{A:"X", B:"Y"}` | empty *(no save fires)* |
| 2 | empty | yes → materialize | `{A:"X", B:"Y"}` | A="X", B="Y", C=empty | types "Z" in C | `{A:"X", B:"Y", C:"Z"}` | `{A:"X", B:"Y", C:"Z"}` |
| 3 | empty | yes → materialize | `{A:"X", B:"Y"}` | A="X", B="Y", C=empty | clears A | `{B:"Y"}` | `{B:"Y"}` |
| 4 | empty | yes → materialize | `{A:"X", B:"Y"}` | A="X", B="Y", C=empty | clears A *and* B | `{}` | empty *(edge case)* |
| 5 | `{A:"Alice"}` | no | `{A:"Alice"}` | A="Alice", B=empty, C=empty | nothing | `{A:"Alice"}` | `{A:"Alice"}` *(no save fires)* |
| 6 | `{A:"Alice"}` | no | `{A:"Alice"}` | A="Alice", B=empty, C=empty | types "Z" in C | `{A:"Alice", C:"Z"}` | `{A:"Alice", C:"Z"}` |
| 7 | `{A:"Alice"}` | no | `{A:"Alice"}` | A="Alice", B=empty, C=empty | types "T" in B | `{A:"Alice", B:"T"}` | `{A:"Alice", B:"T"}` |
| 8 | `{A:"Alice"}` | no | `{A:"Alice"}` | A="Alice", B=empty, C=empty | clears A | `{}` | empty *(edge case)* |
| 9 | `{B:"Y"}` | no | `{B:"Y"}` | A=empty, B="Y", C=empty | nothing | `{B:"Y"}` | `{B:"Y"}` |

Row 9 is important: if a previous session left the doc with only B in it (e.g. the user cleared A in row 3), on the next load A renders **empty**, not "X". Cleared stays cleared.

### Reload chain — one document over time

Same schema. Trace one document across sessions:

| Step | What happens | Disk state | Render |
|---|---|---|---|
| 1 | Open new doc | empty | A="X", B="Y", C=empty *(materialized in memory; not yet on disk)* |
| 2 | Type "Z" in C, blur (save fires) | `{A:"X", B:"Y", C:"Z"}` | A="X", B="Y", C="Z" |
| 3 | Close tab |  |  |
| 4 | Reopen — load reads disk | `{A:"X", B:"Y", C:"Z"}` | A="X", B="Y", C="Z" *(no materialization — data not empty)* |
| 5 | Clear A, save | `{B:"Y", C:"Z"}` | A=empty, B="Y", C="Z" |
| 6 | Close, reopen | `{B:"Y", C:"Z"}` | A=empty, B="Y", C="Z" *(A stays cleared)* |
| 7 | Clear B and C, save | empty | A=empty, B=empty, C=empty |
| 8 | Close, reopen | empty | A="X", B="Y", C=empty *(materialized — edge case)* |

### Where defaults can appear

| Source of a default reaching the user | When |
|---|---|
| Load-time materialization | Disk-empty document, schema carries defaults |
| `addItem` on an array | User clicks "add item" — `mutate.js buildDefault` seeds the new item |
| *Anywhere else* | **Never.** The renderer does not synthesize defaults. |

### Why this shape

- Single source of truth: the document holds the values; the renderer reflects it. There is no "what's displayed vs what's saved" divergence to reason about.
- The renderer is stateless with respect to load history. It needs no `documentIsFresh` flag, no session bit, no special branch for defaults.
- On a fresh document, the first user mutation persists the typed field *and* all materialized defaults in one save. A user touching one field does not silently drop the displayed defaults for the others.
- On a previously-saved document, a missing key is treated as cleared and stays cleared — restoring a default would silently overwrite the user's intent on the next save.

### Known limit

A document that has been edited and then fully cleared saves with empty `data` (rows 4 and 8 in the scenario table). On the next load `isDataEmpty` returns true and defaults re-materialize. This is a property of the storage format, not the editor — there is nowhere in the saved HTML to record "the user intentionally emptied this." If the storage format gains a representation for null-distinct-from-absent, materialization can be replaced with that distinction and the edge case disappears.

### Why `materializeDefaults` is distinct from `mutate.js`'s `buildDefault`

Both walk a definition tree and produce a default-filled value, but they have different jobs.

- `mutate.js buildDefault` seeds a complete shape for a new array item (a string without a default becomes `''`, ready for an input box). It is always called in response to a deliberate user action.
- `core/index.js materializeDefaults` writes only keys that carry real intent. Fields without a default stay absent so they prune to nothing on save instead of being written as empty placeholders.

They stay separate on purpose.

---

## 12. Rules

### NEVER

- Let UI mutate document state directly (always via `core`).
- Let UI call persistence directly.
- Let `core/` import from `ui/` or `app/`.
- Let `core/` depend on DOM or Lit.
- Silently degrade on unsupported schema features.

### ALWAYS

- Keep `core/` headless.
- Keep UI/navigation state local to the shell.
- Use JSON Pointer for canonical addressing.
- Use stable IDs for array-item render keys.
- Debounce high-frequency input in the UI component, not in the core.
