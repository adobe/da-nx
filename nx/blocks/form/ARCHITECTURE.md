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
const core = createCore({ path, saveDocument });

const state = await core.load({ schema, document });    // async

const state = core.setField(pointer, value);            // sync
const state = core.addItem(pointer);                    // sync
const state = core.insertItem(pointer);                 // sync — insert before this pointer
const state = core.removeItem(pointer);                 // sync
const state = core.moveItem(pointer, fromIndex, toIndex); // sync

const state = core.getState();
```

`load` awaits schema/document parsing. All mutations are synchronous: they apply, fire `saveDocument` fire-and-forget, and return a state snapshot.

```js
state = {
  document:   { values },
  model:      { root, byPointer, document } | null,
  validation: { errorsByPointer },
}
```

---

## 4. UI wiring

The shell instantiates `core`, holds the current state snapshot, and the navigation state. It passes `core` plus callbacks to the children:

```js
<sc-editor
  .core=${this._core}
  .state=${this._state}
  .nav=${this._nav}
  .onMutate=${this._onMutate}
  .onSelect=${this._onSelect}
></sc-editor>

<sc-sidebar
  .state=${this._state}
  .nav=${this._nav}
  .onSelect=${this._onSelect}
></sc-sidebar>
```

Components call `core` directly (`core.setField(...)`, `core.addItem(...)`), then notify the shell via `onMutate()` so it can pull a fresh snapshot. Selection changes go through `onSelect(pointer, origin)`.

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

Persistence is immediate after every mutation. `core` calls `saveDocument({ path, document })` fire-and-forget. Save failure currently has no UI surface — if that becomes a product requirement, surface a `saving | saved | error` state in the shell. There is no save-sequence tracking; out-of-order completions are not a concern in practice for human-paced edits.

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

## 11. Rules

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
