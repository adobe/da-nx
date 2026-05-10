# Form V3 Editor Flow (Step-by-Step)

## 1) Startup Order (Exact Sequence)

This is the runtime order when the block loads.

1. `form-v3.js:init(el)` is called.
2. `setup(el)` runs:
   - clears the block DOM
   - reads current route/resource via `getPathDetails()`
   - mounts `da-title`
   - mounts `sc-form-shell` and passes `details`
3. `sc-form-shell` detects `details` changed and calls `loadFormContext({ details })`.
4. `app/context-loader.js` loads context (schema + document).
5. If context is `ready`, shell calls `_startApp(...)`.
6. `_startApp(...)` creates the app through `createFormApp(...)`.
7. `createFormApp(...)` wires:
   - `createFormCore(...)`
   - `createFormController({ core })`
   - `createStateBinding({ controller, onState })`
8. Shell calls `app.load()`.
9. `core.load({ schema, document })` compiles schema, builds runtime model, validates, emits first state snapshot.
10. Shell receives state via `onState`, builds view context, renders:
    - `sc-form-editor`
    - `sc-form-preview`
    - `sc-form-sidebar`

Route change behavior:

- `window.hashchange` triggers `setup(el)` again.
- The old app is disposed and a fresh app instance is created for the new path.

## 2) What Each Part Does

### `form-v3.js` (Shell / Orchestrator)

- Owns app lifecycle (load, dispose, remount on hash change).
- Loads context before core starts.
- Decides screen state (`loading`, `blocked`, `select-schema`, `no-schemas`, `ready`).
- Receives all bubbled `form-intent` events and forwards to controller.
- Converts app snapshot to UI view context.

### `app/context-loader.js` (Pre-flight gate)

- Loads schemas for current `owner/repo`.
- Fetches source HTML for the target document.
- Detects unsupported cases (not HTML, not SC document, no access, missing schema, parse failure).
- Returns one normalized context object with a `status`.

### `app/bootstrap.js` (Composition root)

- Connects core + controller + state binding.
- Injects persistence adapter into core:
  - JSON -> pruned JSON (`serialize`)
  - pruned JSON -> HTML (`json2html`)
  - HTML -> DA save API (`saveSourceHtml`)

### `core/*` (Headless business engine)

- Canonical state container.
- Schema compile/resolve.
- Runtime model build + pointer index.
- Command handling (`field.change`, `array.add`, `array.insert`, `array.remove`, `array.move`).
- Validation and save status.
- Immediate persistence with sequence protection.

### `ui-lit/*` (View + intents)

- Renders state only.
- Emits user intents (`form-intent`) upward.
- Does not mutate canonical data directly.
- Keeps only local interaction behavior (for example, selection scrolling sync).

## 3) Context Loading Flow (Before Editor Is Ready)

`loadFormContext({ details })` runs this order:

1. Start schema load (`loadSchemas`).
2. Verify target is a document resource.
3. Fetch document source HTML.
4. If HTML is empty:
   - has schemas -> `select-schema`
   - no schemas -> `no-schemas`
5. If HTML is not structured-content format -> `blocked:not-form-content`.
6. Convert HTML -> JSON.
7. Resolve `json.metadata.schemaName` in loaded schemas.
8. If schema missing -> `blocked:missing-schema`.
9. Otherwise return `ready` with `{ schema, json, schemaName }`.

## 4) Communication Flow Between Parts

### A) Intent Flow (UI -> Controller -> Core)

1. User edits field / array / navigation.
2. UI component emits `form-intent`.
3. Shell catches event and calls `controller.handleIntent(intent)`.
4. Controller behavior:
   - navigation intent -> UI-local state only
   - field/array intent -> map to core command and dispatch to core
   - field change may be debounced
5. Core processes command and updates canonical state.

### B) State Flow (Core -> Controller -> Shell -> UI)

1. Core emits new state snapshot from its store.
2. Controller merges:
   - core state
   - UI navigation state
3. State binding forwards snapshot to shell `onState`.
4. Shell transforms to `context` and passes to editor/preview/sidebar.
5. UI rerenders from new context.

### C) Persistence Flow (Core -> Boundary APIs)

After a successful mutation:

1. Core sets status to `saving` and emits.
2. Core calls injected `saveDocument(...)`.
3. Save adapter runs:
   - `serialize` (prune empty values)
   - `json2html`
   - `saveSourceHtml` (POST to DA source endpoint)
4. Core receives response:
   - success -> `saved`
   - error -> `persistence-failed` + blocker + last persistence error
5. Core ignores stale save completions using save sequence numbers.

## 5) Detailed Core <-> UI Communication Contract (Crystal Clear)

### 5.1) Single Rule

The UI never mutates canonical data and never calls persistence directly.

All communication follows this chain:

`UI component -> form-intent event -> shell -> controller -> core -> controller -> state binding -> shell -> UI props/context`

### 5.2) Communication Channels And Message Shapes

### Channel 1: DOM intent event (from UI components)

- Event name: `form-intent`
- Emitted by: `sc-form-editor`, `sc-form-sidebar`, `sc-array-item-menu`, reorder controls
- Transport: bubbling `CustomEvent` (crosses shadow DOM with `composed: true`)
- Example payload:

```js
{
  type: 'form-field-change',
  pointer: '/data/title',
  value: 'Hello',
  debounceMs: 350
}
```

### Channel 2: shell -> controller method call

- Shell receives `form-intent` and calls:
  - `controller.handleIntent(intent)` (or `dispatch`)
- This is the only path from shell/UI to the headless layers.

### Channel 3: controller -> core command dispatch

- Controller maps intent names to core command names:
  - `form-field-change` -> `field.change`
  - `form-array-add` -> `array.add`
  - `form-array-insert` -> `array.insert`
  - `form-array-remove` -> `array.remove`
  - `form-array-reorder` -> `array.move`
- Core command shape example:

```js
{
  type: 'field.change',
  pointer: '/data/title',
  value: 'Hello'
}
```

### Channel 4: core -> controller subscription

- Controller subscribes to core via `core.subscribe(listener)`.
- Every core emit gives a full core snapshot.
- Controller merges this with UI-local navigation state.

### Channel 5: controller -> shell state fanout

- `state-binding` subscribes to controller.
- It clones snapshots and forwards them through `onState(snapshot)`.
- Shell stores `_state`, then passes derived `context` to UI components.

### 5.3) What Is UI-Local vs Core-Canonical

- **UI-local (controller/ui-state only):**
  - `ui.navigation.activePointer`
  - `ui.navigation.selectionOrigin`
  - `ui.navigation.selectionSequence`
- **Core-canonical (core state):**
  - document values
  - runtime model
  - validation errors
  - compatibility status
  - save/load status
  - blockers/persistence errors

Important: pointer selection is intentionally not stored in core.

### 5.4) Sequence A: Navigation Click (No Core Dispatch)

1. Sidebar button click emits:
   - `{ type: 'form-nav-pointer-select', pointer, origin: 'sidebar' }`
2. Shell forwards to controller.
3. Controller detects UI-selection intent and updates `uiStateStore`.
4. Controller publishes merged snapshot (core state unchanged).
5. Shell rerenders context with new active pointer.
6. Editor receives pointer with `origin: 'sidebar'` and scrolls to the selected node.

Result: no `core.dispatch`, no validation, no persistence.

### 5.5) Sequence B: Field Edit (Debounce + Save)

1. Editor input emits `form-field-change` with `debounceMs` (typically `350`).
2. Shell forwards intent to controller.
3. Controller maps to `field.change`.
4. If same pointer has a pending timer, old timer is cancelled (latest value wins).
5. Timer fires -> controller dispatches command to core.
6. Core mutation pipeline:
   - guards compatibility/editability
   - applies pointer mutation on cloned document
   - rebuilds runtime model + index
   - validates
   - emits updated state
7. Core starts persistence:
   - sets `saving` status and emits
   - calls injected save adapter
8. Save adapter runs:
   - `serialize` -> prune empties
   - `json2html`
   - `saveSourceHtml` POST
9. Core handles response:
   - success -> `saved`
   - failure -> `persistence-failed`
   - stale response -> ignored if sequence is old
10. Updated snapshots flow back to shell and then to editor/preview/sidebar.

### 5.6) Sequence C: Array Reorder

1. Array menu/reorder UI emits:
   - `{ type: 'form-array-reorder', pointer, beforePointer }`
2. Controller maps to `array.move` and forwards to core.
3. Core reorders array item by pointer, rebuilds model/index, validates, emits, persists, emits final save state.
4. Because runtime model assigns stable item IDs, UI retains stable render identity even when pointers shift.

### 5.7) Snapshot Shape Crossing The UI Boundary

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
    navigation: { activePointer, selectionOrigin, selectionSequence }
  }
}
```

Shell view-context mapping:

- `context.runtime.root` <- `state.model.formModel`
- `context.validation.errorsByPointer` <- `Map(Object.entries(state.validation.errorsByPointer))`
- `context.activeNavPointer` <- `state.ui.navigation.activePointer`
- `context.json` <- `state.document.values`

### 5.8) Ownership Boundaries (Who Can Talk To Whom)

- UI components can only emit intents upward.
- Shell can only call controller API.
- Controller can call core API and UI-state store API.
- Core never calls UI code.
- Persistence/network APIs are called only through core's injected `saveDocument`.

### 5.9) Ordering, Safety, and Disposal Guarantees

- Field edits are debounced per pointer in controller.
- Save requests are sequenced in core; stale completions are ignored.
- Unknown commands are explicitly rejected with `lastCommandResult.ignored = true`.
- On remount/dispose:
  - state-binding unsubscribes listeners
  - controller clears debounce timers and unsubscribes from core
  - controller disposes core

This prevents old instances from leaking events into a new editor instance.

## 6) Core Command Pipeline (In Order)

For each mutation command:

1. Command validity and compatibility guards.
2. Pointer-based mutation on a cloned document.
3. Rebuild runtime form model.
4. Rebuild pointer index.
5. Validate entire runtime tree.
6. Emit state immediately.
7. Persist immediately.
8. Emit final save state (`saved` or `persistence-failed`).

## 7) Statuses You Should Expect During Runtime

- `loading`: startup or reload in progress
- `ready`: clean and editable
- `validation-error`: editable but validation issues exist
- `saving`: save request in flight
- `saved`: latest save acknowledged
- `persistence-failed`: save failed
- `schema-unsupported`: schema contains unsupported constructs
- `document-incompatible`: document shape does not match compiled model
- `invalid-document`: missing/invalid `metadata` or `data`

## 8) Practical Mental Model

Use this to follow the system quickly:

`hash/path -> shell setup -> context gate -> app bootstrap -> core load -> UI render -> user intent -> core command -> validate -> persist -> state emit -> UI rerender`

If debugging, always locate the issue in this order:

1. Context gate (`app/context-loader.js`)
2. Command mapping (`ui-lit/controllers/intent-command-map.js`)
3. Core dispatch/mutation (`core/form-core.js`)
4. Boundary persistence (`app/boundary/serialize.js`, `json2html.js`, `da-source-api.js`)
