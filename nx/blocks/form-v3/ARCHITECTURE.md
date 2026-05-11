# Form V3 — Architecture

## 1. Purpose

Form V3 is a JSON Schema-driven structured content editor.

It is designed as a:

- headless stateful core
- thin reactive UI

The core owns all business logic. The UI renders state and calls core methods.

---

## 2. Layer Structure

```txt
form-v3/
  app/           ← external world: bootstrapping, boundary adapters
  core/          ← editor engine: state, mutation, validation, persistence
  ui-lit/        ← rendering and interaction
  form-v3.js     ← Lit shell: entry point, context loading, screen routing
```

### app/

Responsibilities:

- bootstrapping (`bootstrap.js` — wires core + controller + persistence adapter)
- context loading (`context-loader.js` — fetches document HTML and schemas)
- boundary adapters:
  - `da-source-api.js` — fetch/save to DA source endpoint
  - `html2json.js` / `json2html.js` — HTML ↔ JSON conversion
  - `schema-registry.js` — schema discovery
  - `serialize.js` — document serialization

The app layer is the only place that knows about external services.

### core/

Responsibilities:

- canonical document state
- schema compilation
- runtime model building
- mutation
- validation
- persistence (immediate, with save sequencing)
- compatibility checks

The core must be executable without Lit, DOM, or any rendering context.

### ui-lit/

Responsibilities:

- rendering (`components/`)
- interaction and intent dispatch
- UI-local interaction state (`state/ui-state.js`)
- controller that bridges core to components (`controllers/form-controller.js`)

---

## 3. Dependency Direction

Dependencies flow in one direction only:

```txt
app/     →  core/
app/     →  ui-lit/
ui-lit/  →  core/
```

**`core/` must never import from `ui-lit/` or `app/`.**

`app/` wires everything together at bootstrap, but the core and UI layers are unaware of each other and of external services.

Violating this breaks headless testability and UI replaceability.

---

## 4. Non-Negotiable Rules

### Core is the source of truth

The core owns canonical document state, validation, and persistence.

The UI never owns canonical state.

### UI is a thin interaction layer

The UI must not:

- mutate JSON directly
- call persistence directly
- perform schema logic
- perform validation logic

### Explicit methods, explicit state

The communication model is:

```txt
UI calls core method
→ core updates state
→ core returns updated snapshot
→ UI rerenders
```

This is **not** an event-driven, Redux-like, or pub/sub system.

### Headless core

The core must work in tests, CLI, and automation without a browser.

### UI state stays in UI

Interaction state (active pointer, focus, selection, dialog visibility) lives in `ui-lit/state/ui-state.js` only. The core must never store it.

### Immediate persistence

There is no draft state. Every mutation persists immediately.

### Stable identifiers

JSON Pointer (RFC 6901) is the canonical address for all state, mutations, and errors. Stable internal IDs (not pointers) are used to key array item rendering.

---

## 5. Core API

```js
const core = createFormCore({ path, saveDocument });

const state = await core.load({ schema, document, permissions }); // async

const state = core.setFieldValue(pointer, value);              // sync
const state = core.addArrayItem(pointer);                      // sync
const state = core.removeArrayItem(pointer);                   // sync
const state = core.moveArrayItem(pointer, fromIndex, toIndex); // sync

const state = core.getState();

core.dispose();
```

`load` is async because it awaits schema and document parsing. All mutation methods are synchronous — they apply the mutation, fire persistence as fire-and-forget, and return a full state snapshot immediately. The UI re-renders from that snapshot.

---

## 6. State

### Core state shape

```js
{
  document: { values },           // canonical JSON document
  model:    { formModel },        // compiled runtime model tree
  validation: { errorsByPointer },
}
```

Core state is serializable and UI-independent.

### UI state shape

```js
{
  navigation: {
    activePointer,      // currently focused field pointer
    selectionOrigin,    // 'editor' | 'sidebar' | null — drives scroll sync
    selectionSequence,  // monotonic counter — detects new selections
  }
}
```

UI state lives in `ui-lit/state/ui-state.js` and never enters the core.

### Combined state (controller view)

The controller merges both for the rendering layer:

```js
{ ...coreState, ui: uiState }
```

Components consume only the merged snapshot passed as `context`.

---

## 7. Runtime Model Nodes

The schema compiler produces a form definition; the runtime model builder combines it with the current document to produce a tree of nodes consumed by the UI.

Each node has a `kind` that determines how it renders:

| kind | description |
|------|-------------|
| `string` | text input |
| `number` | number input |
| `integer` | integer number input |
| `boolean` | checkbox |
| `object` | fieldset containing child nodes |
| `array` | repeating list of item nodes |
| `unsupported` | schema feature not supported by this editor |

Common node properties:

```js
{
  id,           // stable render key (UUID, never changes across mutations)
  pointer,      // RFC 6901 JSON Pointer — changes when array items move
  kind,         // one of the kinds above
  label,        // display label derived from schema
  required,     // boolean
  readonly,     // boolean
  sourceValue,  // value loaded from the persisted document
  defaultValue, // schema-derived fallback
  enumValues,   // string[] — present when the field is an enum
}
```

Array nodes additionally have:

```js
{
  items,     // child nodes[]
  minItems,
  maxItems,
  itemLabel, // singular label for items (e.g. "Contact")
}
```

Object nodes additionally have:

```js
{
  children,  // child nodes[]
}
```

Unsupported nodes carry an `unsupported` object describing the unrecognised feature. The editor renders them as an explicit error, never silently as a string field.

When adding a new field type, add a new `kind` value to the schema compiler and handle it explicitly in `editor.js`. Never fall through to a default renderer.

---

## 8. Shell Responsibilities

`form-v3.js` is the application entry point and screen router.

It:

- bootstraps the app (`createFormApp`)
- loads external context (`loadFormContext`)
- routes to the correct screen (loading, blocked, schema selector, editor)
- catches `form-intent` events and forwards to the controller
- re-renders when the controller returns a new snapshot

It must not:

- orchestrate mutations
- manage selection or navigation state
- contain validation or persistence logic
- become a second controller

If logic in `form-v3.js` starts making decisions about document state or field values, it belongs in the core or controller instead.

---

## 9. Controller Responsibilities

`ui-lit/controllers/form-controller.js` is the only UI–core bridge.

It:

- calls core methods in response to UI intents
- manages UI state (`setSelection`)
- merges core state + UI state for the shell

It must not:

- contain business logic
- contain validation logic
- contain persistence logic

---

## 10. Intent System

Components dispatch `CustomEvent('form-intent', { detail })` with a structured payload.

The shell (`form-v3.js`) catches these and forwards to `controller.handleUiIntent(detail)`.

Intent types:

| type | payload | handled by |
|------|---------|------------|
| `form-field-change` | `pointer`, `value` | `core.setFieldValue` |
| `form-array-add` | `pointer` | `core.addArrayItem` |
| `form-array-remove` | `pointer` | `core.removeArrayItem` |
| `form-array-reorder` | `pointer`, `fromIndex`, `toIndex` | `core.moveArrayItem` |
| `form-nav-pointer-select` | `pointer`, `origin` | UI state only |

Intents express user intent. They never contain DOM references or UI logic.

---

## 11. Input Debouncing

Debouncing belongs in UI components only — not in the core and not in the controller.

**Why:** the core is callable programmatically (tests, automation). A debounce inside the core would add arbitrary delay to those callers. The controller is a thin bridge and must not accumulate timer state.

**Rule:** components that produce high-frequency input (text, number) debounce their `form-intent` dispatch before emitting. The core always mutates and persists immediately on every call it receives.

The debounce is keyed per pointer so that typing in one field does not reset the timer for another:

```js
// editor.js — correct place for debounce
_emitIntentDebounced(pointer, detail, ms = 350) {
  clearTimeout(this._inputTimers.get(pointer));
  this._inputTimers.set(pointer, setTimeout(() => {
    this._inputTimers.delete(pointer);
    this._emitIntent(detail);
  }, ms));
}
```

Boolean, select, and all array intents fire immediately without debounce.

---

## 12. Arrays

JSON Pointer is positional — pointers change when items move. Therefore:

- **Pointers** are for addressing fields in the document and core operations.
- **Stable IDs** (assigned by runtime model builder) are used as rendering keys.

```js
// array item runtime node
{ id: "uuid-123", pointer: "/contacts/0", kind: "object", ... }
```

Reorder uses explicit indices:

```js
core.moveArrayItem("/contacts", fromIndex, toIndex)
```

---

## 13. Persistence

Persistence is immediate after every mutation.

Save sequencing prevents stale responses from overwriting newer edits:

```txt
latestRequested increments per save attempt
stale completions (sequence < latestRequested) are discarded
```

The persistence adapter is injected at bootstrap via `saveDocument({ path, document })`.

---

## 14. File Map

```txt
form-v3/
  form-v3.js                          ← Lit shell, screen routing, context loading

  app/
    bootstrap.js                      ← creates core + controller, wires adapter
    context-loader.js                 ← loads document HTML + schemas
    boundary/
      da-source-api.js                ← fetch/save to DA
      html2json.js                    ← parse HTML → JSON
      json2html.js                    ← render JSON → HTML
      schema-registry.js              ← schema discovery
      serialize.js                    ← serialization

  core/
    form-core.js                      ← core entry point, public API
    state/
      state-store.js                  ← simple store: getState / setState / dispose
    model/
      runtime-model-builder.js        ← builds runtime tree from schema + document
      runtime-model-index.js          ← pointer → node lookup
      json-pointer.js                 ← pointer utilities
      ids.js                          ← stable array item ID generation
    schema/
      schema-compiler.js              ← compiles JSON Schema to form definition
      schema-defaults.js              ← default value extraction
      schema-resolver.js              ← $ref resolution
    mutation/
      array-mutator.js                ← add / remove / move array items
      value-mutator.js                ← field value updates
    validation/
      validation-engine.js            ← validates document against schema

  ui-lit/
    state/
      ui-state.js                     ← navigation / selection state
    controllers/
      form-controller.js              ← intent handler, core/UI bridge
    components/
      editor.js / editor.css          ← field rendering, array rendering
      sidebar.js / sidebar.css        ← navigation panel
      preview.js / preview.css        ← read-only preview
      array-item-menu.js/.css         ← per-item action menu
      reorder-dialog.js/.css          ← reorder interaction UI
      form-shell.css                  ← shell layout
```

---

## 15. Rules Summary

### NEVER

- store UI interaction state in the core
- let UI mutate document state directly
- let UI call persistence directly
- let core import from `ui-lit/` or `app/`
- let core depend on DOM or Lit
- use generic dispatch / subscribe / event bus patterns
- put debounce logic in the core or controller
- allow stale save responses to overwrite newer state
- silently degrade on unsupported schema features — render an explicit unsupported node

### ALWAYS

- keep the core headless
- keep UI state local to `ui-lit/`
- use explicit core methods (not generic dispatch)
- use JSON Pointer for canonical addressing
- use stable IDs for array item rendering keys
- keep persistence inside the core
- keep validation inside the core
- debounce high-frequency input in the UI component
- keep the UI replaceable
