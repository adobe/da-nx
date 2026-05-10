# Form V3 Editor Flow (Current Architecture)

## 1) Startup Order (Exact Sequence)

1. `form-v3.js:init(el)` is called.
2. `setup(el)` runs:
   - clears the block DOM
   - reads current route/resource via `getPathDetails()`
   - mounts `da-title`
   - mounts `sc-form-shell` and passes `details`
3. `sc-form-shell` detects `details` changed and calls `loadFormContext({ details })`.
4. `app/context-loader.js` loads context (`schema`, `document`, blockers).
5. If context is `ready`, shell calls `_startApp(...)`.
6. `_startApp(...)` creates the app through `createFormApp(...)`.
7. `createFormApp(...)` wires:
   - `createFormCore(...)`
   - `createFormController({ core })`
8. Shell calls `app.load()`.
9. `app.load()` calls `core.load({ schema, document })`, then `controller.syncCoreState(coreState)`.
10. Shell stores the snapshot in `_state`, builds view context, and renders:
    - `sc-form-editor`
    - `sc-form-preview`
    - `sc-form-sidebar`

Route change behavior:

- `window.hashchange` triggers `setup(el)` again.
- The old app is disposed and a fresh app instance is created for the new path.

## 2) Ownership Boundaries

### `form-v3.js` (Shell / Orchestrator)

- Owns lifecycle (load, dispose, remount on hash change).
- Handles context-gated screens (`loading`, `blocked`, `select-schema`, `no-schemas`, `ready`).
- Receives `form-intent` events.
- Calls `controller.handleIntent(intent)` and rerenders using the returned snapshot.
- Converts state snapshot to UI view context.

### `app/context-loader.js` (Pre-flight gate)

- Loads schemas for current `owner/repo`.
- Fetches source HTML for target document.
- Detects unsupported cases (`not-document`, `not-form-content`, `missing-schema`, access/load failures).
- Returns one normalized context object with `status`.

### `app/bootstrap.js` (Composition root)

- Composes core + controller.
- Injects persistence adapter into core:
  - JSON pruning via `serialize`
  - HTML conversion via `json2html`
  - DA save via `saveSourceHtml`

### `core/*` (Headless stateful engine)

- Owns canonical state.
- Compiles schema and builds runtime model/index.
- Runs explicit operations:
  - `setFieldValue(pointer, value)`
  - `addArrayItem(pointer)`
  - `removeArrayItem(pointer)`
  - `moveArrayItem(pointer, fromIndex, toIndex)`
- Runs validation and persistence.
- Returns explicit state snapshots.

### `ui-lit/*` (View + interaction)

- Renders from context only.
- Emits user intents (`form-intent`).
- Keeps UI-local interaction state (navigation pointer/origin/sequence).
- Never mutates canonical document directly.

## 3) Context Loading Flow (Before Editor Is Ready)

`loadFormContext({ details })` order:

1. Start schema load (`loadSchemas`).
2. Verify target is a document resource.
3. Fetch source HTML.
4. If HTML is empty:
   - has schemas -> `select-schema`
   - no schemas -> `no-schemas`
5. If HTML is not structured-content format -> `blocked:not-form-content`.
6. Convert HTML -> JSON.
7. Resolve `json.metadata.schemaName` against loaded schemas.
8. If schema missing -> `blocked:missing-schema`.
9. Otherwise return `ready` with `{ schema, json, schemaName }`.

## 4) Communication Flow

### A) Intent Flow (UI -> Shell -> Controller -> Core)

1. User edits field/array/navigation.
2. UI component emits `form-intent`.
3. Shell calls `controller.handleIntent(intent)`.
4. Controller routes intent:
   - navigation -> UI-local state update only
   - field/array -> explicit core operation call(s)
   - field changes may be debounced
5. Controller returns merged snapshot (`coreState + uiState`).
6. Shell stores snapshot and rerenders.

### B) State Flow (Explicit Pull)

There is no push pipeline. State updates are explicit:

1. Controller calls core operation.
2. Core updates canonical state.
3. Core returns a snapshot.
4. Controller merges with UI-local state.
5. Shell rerenders from returned snapshot.

### C) Persistence Flow (Core -> Boundary APIs)

After successful mutation:

1. Core sets status to `saving`.
2. Core calls injected `saveDocument(...)`.
3. Save adapter runs:
   - `serialize` (prune empty values)
   - `json2html`
   - `saveSourceHtml` (POST to DA source endpoint)
4. Core handles result:
   - success -> `saved`
   - failure -> `persistence-failed` + blocker + last persistence error
5. Core ignores stale completions via save sequence numbers.

## 5) Intent To Operation Mapping

Controller mapping:

- `form-field-change` -> `core.setFieldValue(pointer, value)`
- `form-array-add` -> `core.addArrayItem(pointer)`
- `form-array-remove` -> `core.removeArrayItem(pointer)`
- `form-array-reorder` -> `core.moveArrayItem(arrayPointer, fromIndex, toIndex)`
- `form-array-insert` -> composed operation:
  1. `core.addArrayItem(arrayPointer)`
  2. `core.moveArrayItem(arrayPointer, insertedIndex, targetIndex)` (when insertion is not append)

Selection intents remain UI-local:

- `form-nav-pointer-select`
- `selection.change`

## 6) Snapshot Shape Crossing UI Boundary

Controller snapshot (simplified):

```js
{
  status: { code, details, updatedAt },
  document: { values },
  model: { formModel },
  validation: { errors, errorsByPointer },
  saving: { status, sequence, requestedSequence, acknowledgedSequence },
  loading: { status },
  compatibility: { status, editable, unsupportedFeatures },
  errors: { blockers, lastPersistenceError },
  lastCommandResult,
  ui: {
    navigation: { activePointer, selectionOrigin, selectionSequence },
  },
}
```

Shell view-context mapping:

- `context.runtime.root` <- `state.model.formModel`
- `context.validation.errorsByPointer` <- `Map(Object.entries(state.validation.errorsByPointer))`
- `context.activeNavPointer` <- `state.ui.navigation.activePointer`
- `context.activeNavOrigin` <- `state.ui.navigation.selectionOrigin`
- `context.activeNavSequence` <- `state.ui.navigation.selectionSequence`
- `context.json` <- `state.document.values`

## 7) Ordering, Safety, and Disposal

- Field edits are debounced per pointer in controller.
- Save requests are sequenced in core; stale completions are ignored.
- Core remains headless and deterministic.
- On dispose:
  - controller clears debounce timers
  - controller disposes UI-local state
  - controller disposes core

## 8) Practical Mental Model

Use this to follow the system quickly:

`hash/path -> shell setup -> context gate -> app bootstrap -> core load -> UI render -> user intent -> core operation -> validate -> persist -> snapshot -> UI rerender`

Debug in this order:

1. Context gate (`app/context-loader.js`)
2. Intent mapping (`ui-lit/controllers/intent-command-map.js`)
3. Core operations (`core/form-core.js`)
4. Persistence boundary (`app/boundary/serialize.js`, `json2html.js`, `da-source-api.js`)
