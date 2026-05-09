# JSON Schema Form Editor — Headless Core Architecture Plan

## 1. Purpose

This document defines the target architecture for the JSON Schema Form Editor.

The goal is to evolve the current implementation into a:

- headless
- event-driven
- state-driven
- UI-agnostic
- highly testable
- schema-driven

editor platform.

The UI must become a thin human interaction layer.

The core must own:

- state
- schema compilation
- mutation
- validation
- persistence
- orchestration
- compatibility checks
- permission checks

The UI must only:

- render state
- dispatch user intent
- subscribe to state changes

---

## 2. Non-Negotiable Architectural Rules

These rules must not be violated.

### 2.1 Core is the source of truth

The core owns the canonical application state.

The UI must never own canonical state.

### 2.2 UI is a pure interaction layer

The UI must not:

- mutate JSON directly
- call persistence directly
- perform schema logic
- perform validation logic
- perform permission logic
- query the DOM for business behavior

### 2.3 Commands in, state out

The architecture must follow:

```txt
UI -> Commands -> Core -> State Update -> Persistence -> State Emission -> UI Update
```

The UI dispatches commands.

The core updates state.

The UI rerenders from state snapshots.

### 2.4 Headless core

The core must work without Lit, DOM, or browser rendering.

It must be executable:

- in tests
- in automation
- in scripts
- in future alternate UIs

### 2.5 Schema must not leak into leaf UI

Raw JSON Schema must not be passed into leaf components unless a component explicitly requires a normalized schema-derived field definition.

Leaf components should consume the internal form model only.

### 2.6 Immediate persistence

There is no draft state.

Field changes must update the JSON and persist immediately.

### 2.7 Stable identifiers

Use RFC 6901 JSON Pointer as the canonical logical address.

Use stable internal IDs for rendering and array item identity.

---

## 3. What This Architecture Must Achieve

The final architecture must allow:

- multiple UIs
- headless execution
- deterministic testing
- automation
- future extensibility
- isolated core logic
- minimal UI coupling
- predictable array behavior
- immediate persistence
- explicit error handling
- explicit loading handling

The architecture must remain simple, but not by mixing concerns.
It must remain simple by separating concerns clearly.

---

## 4. High-Level Architecture

```txt
┌─────────────────────┐
│        UI           │
│  Lit Components     │
│  Human Interaction  │
└──────────┬──────────┘
           │ commands
           ▼
┌─────────────────────┐
│      CORE           │
│                     │
│  Store              │
│  Schema Compiler    │
│  Model Builder      │
│  Validation         │
│  Mutation Engine    │
│  Persistence        │
│  Authorization      │
│  Orchestration      │
└──────────┬──────────┘
           │ state updates
           ▼
┌─────────────────────┐
│    State Stream     │
└──────────┬──────────┘
           │ subscriptions
           ▼
┌─────────────────────┐
│        UI           │
│     Rerender        │
└─────────────────────┘
```

---

## 5. Core Responsibilities

The core must own all application logic.

### 5.1 Schema compilation

Input:

- JSON Schema

Output:

- normalized internal form model

The UI must never consume raw schema directly.

### 5.2 Runtime model creation

The core builds runtime form instances using:

```txt
schema + existing json
```

The runtime model must:

- instantiate arrays
- instantiate nested objects
- preserve stable IDs
- generate defaults
- preserve pointer-based lookup

### 5.3 State management

The core owns:

- current JSON values
- validation errors
- save state
- loading state
- selection state
- permissions
- active nodes
- schema compatibility state

The core is the canonical state container.

### 5.4 Validation

The core validates:

- fields
- objects
- arrays
- cross-field rules
- schema compatibility
- runtime data compatibility

Validation results are normalized.

Example:

```js
{
  pointer: "/contacts/0/name",
  message: "Required"
}
```

### 5.5 Mutation

The core owns all mutations.

Examples:

- field changes
- array item add/remove
- reorder
- object creation
- value replacement

The UI must never mutate JSON directly.

### 5.6 Persistence

The core owns persistence.

Persistence is immediate.

Flow:

```txt
command
  ↓
local state update
  ↓
validation
  ↓
persist
  ↓
save state update
```

### 5.7 Permission checks

Permission checks belong to the core and API boundary.

The UI only receives:

- readonly state
- disabled state
- capability flags

### 5.8 Compatibility checks

The core must decide whether a document is editable.

It must check:

- whether the document can be edited by this editor
- whether the loaded JSON is compatible with the schema
- whether required schema features are supported
- whether the schema contains unsupported constructs

Unsupported schema features must fail explicitly, not silently degrade unless the product explicitly defines fallback behavior.

---

## 6. Command System

The UI communicates with the core exclusively using commands.

### 6.1 Command shape

Example:

```js
{
  type: "field.change",
  pointer: "/contacts/0/name",
  value: "Alice"
}
```

### 6.2 Array commands

```js
{
  type: "array.add",
  pointer: "/contacts"
}
```

```js
{
  type: "array.remove",
  pointer: "/contacts/1"
}
```

```js
{
  type: "array.move",
  pointer: "/contacts",
  from: 1,
  to: 3
}
```

### 6.3 Command rules

Commands:

- express intent only
- never manipulate DOM
- never contain UI logic
- never directly mutate state
- never depend on component structure

---

## 7. State System

The core emits state updates.

The UI subscribes to state changes.

### 7.1 State must be serializable

Core state should remain serializable and deterministic.

Avoid:

- DOM references
- component references
- Lit-specific structures
- callbacks inside persisted state

### 7.2 State shape

State includes:

- form model
- values
- errors
- saving status
- loading status
- selection state
- permissions
- compatibility status
- last command result
- last persistence error

### 7.3 State transitions must be explicit

The core must not mutate important state implicitly in scattered places.

Use a single command handling pipeline or equivalent explicit reducer-like flow.

### 7.4 Save sequencing

Persistence must be protected from race conditions.

The core must:

- assign a save sequence/version
- ignore stale save completions
- preserve newest state as authoritative

If multiple edits happen quickly, an older save response must not overwrite a newer one.

---

## 8. JSON Pointer

RFC 6901 JSON Pointer is the canonical field identifier.

Examples:

```txt
/contacts/0/name
/settings/theme
```

Used for:

- state lookup
- events
- validation
- persistence
- mutations
- error mapping

---

## 9. Arrays

Arrays require special handling.

### 9.1 Important rule

JSON Pointer is positional.

Pointers change when array items move.

Therefore:

- pointers are for addressing
- stable IDs are for rendering

Example:

```js
{
  id: "uuid-123",
  pointer: "/contacts/0"
}
```

### 9.2 Array responsibilities

The core must manage:

- add
- remove
- reorder
- stable IDs
- item instantiation
- item value initialization

### 9.3 Array items can be primitive or object

The form model must support both:

- primitive array items
- object array items

The item renderer type must be derived from the form model, not from the UI.

---

## 10. UI Responsibilities

The UI is a rendering adapter.

The UI:

- renders state
- dispatches commands
- subscribes to updates

The UI does not:

- own canonical state
- persist data
- perform validation
- understand schema internals
- decide compatibility
- decide authorization

---

## 11. Lit Responsibilities

Lit components should remain:

- mostly dumb
- reactive
- isolated

Components:

- receive props/state
- emit commands upward
- rerender on state changes

Components should not:

- mutate shared state
- call APIs
- contain orchestration logic
- know how persistence works

---

## 12. Controller Responsibilities

Controllers are UI adapters between Lit and the core.

Controllers:

- bind UI to core
- subscribe to state
- dispatch commands
- trigger rerenders
- translate UI interaction into commands

Controllers must not:

- implement business logic
- own persistence logic
- own validation logic
- own schema logic

---

## 13. Services

Services belong inside the core.

Services:

- are framework-independent
- contain reusable logic
- contain business rules
- are testable without DOM

Examples:

- schema compiler
- model builder
- validation engine
- mutation engine
- persistence service
- authorization service
- compatibility checker
- default value factory

---

## 14. Explicit Loading / Error / Readonly States

The architecture must represent application status explicitly.

The core must emit states such as:

- loading
- ready
- saving
- saved
- validation error
- permission denied
- schema unsupported
- document incompatible
- persistence failed

The UI must render these states.

The UI must not infer them by guessing.

---

## 15. Strict Dependency Direction

Dependencies must flow in one direction only:

```txt
UI
  ↓
Controllers
  ↓
Core API
  ↓
Services
  ↓
Model
```

Lower layers must never depend on upper layers.

---

## 16. Important Non-Negotiable Rules

### NEVER

- let components mutate state directly
- let UI call persistence directly
- let UI own business logic
- let services depend on Lit
- let core depend on DOM
- let raw schema leak into field components
- silently accept unsupported schema features without a defined rule
- allow stale save responses to overwrite newer data
- use ad-hoc path systems instead of JSON Pointer for canonical addressing

### ALWAYS

- use commands
- use state subscriptions
- use JSON Pointer as canonical addressing
- keep persistence inside the core
- keep validation inside the core
- keep schema logic inside the core
- keep the UI replaceable
- keep the core headless
- keep render IDs stable for arrays
- treat error states as first-class state

---

## 17. Target Core API

The core should eventually expose a minimal API like:

```js
core.load({
  schema,
  document,
  permissions,
});

core.dispatch({
  type: "field.change",
  pointer: "/name",
  value: "Alice",
});

core.subscribe(listener);

core.getState();
```

This is the target architectural boundary.

The API may evolve, but the separation must stay intact.

---

## 18. Target Package Structure

```txt
packages/
  core/
    schema/
    model/
    validation/
    mutation/
    persistence/
    state/
    authorization/

  ui-lit/
    components/
    controllers/
    bindings/

  app/
    bootstrap.js
```

---

## 19. Recommended Internal Module Responsibilities

### core/schema

- parse schema
- resolve references
- reject unsupported constructs
- compile schema to form model

### core/model

- build runtime model from schema + document
- index nodes by pointer
- assign stable IDs

### core/validation

- validate data against compiled model and schema rules
- normalize errors

### core/mutation

- update values by pointer
- add/remove/move array items
- preserve immutability or controlled mutation rules

### core/persistence

- save document immediately
- handle request sequencing
- report failures

### core/state

- hold current state
- expose snapshot
- apply command results

### core/authorization

- evaluate permission to edit
- produce readable access state

### ui-lit/components

- render fields and containers
- emit commands
- never manage business logic

### ui-lit/controllers

- bind core state to components
- forward commands to core
- subscribe to state stream

---

## 20. Migration Strategy

The migration should be incremental.

Do NOT rewrite everything at once.

### Step 1

Strengthen the core boundary.

Move:

- mutation
- validation
- persistence
- orchestration

fully into the core.

### Step 2

Introduce command dispatching.

Replace:

- direct service calls from UI

with:

- commands sent to the core.

### Step 3

Introduce state subscriptions.

The UI rerenders from emitted state snapshots.

### Step 4

Reduce controller complexity.

Controllers become thin adapters.

### Step 5

Remove remaining DOM-aware orchestration from non-UI layers.

The core becomes fully headless.

### Step 6

Make unsupported features explicit.

The core must clearly report:

- unsupported schema
- invalid document
- permission denied
- save failure
- incompatible structure

No silent fallback unless specified by product rules.

### Step 7

Add save sequence protection.

Ensure stale persistence responses cannot overwrite newer edits.

---

## 21. Acceptance Criteria

The architecture is correct only if all of the following are true:

- the editor can run without Lit in the core
- the core can be tested without DOM
- the UI can be replaced without rewriting core logic
- the UI dispatches commands only
- the core owns state and persistence
- JSON Pointer is the canonical address system
- array items have stable IDs for rendering
- loading, saving, permission, and compatibility are explicit state
- unsupported schema features are handled explicitly
- stale save responses are ignored
- raw schema does not leak into leaf components

---

## 22. Final Architectural Summary

The editor is evolving into:

```txt
HEADLESS EVENT-DRIVEN CORE
+
THIN REACTIVE UI
```

The core owns:

- state
- rules
- persistence
- orchestration
- validation
- permissions
- compatibility

The UI owns:

- rendering
- interaction

Commands flow inward.

State flows outward.

This separation is the most important architectural direction and must not be violated.
