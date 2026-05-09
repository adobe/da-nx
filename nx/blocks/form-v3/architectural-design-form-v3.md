# JSON Schema Form Editor — Headless Core Architecture Plan

# 1. Purpose

This document defines the target architecture for the JSON Schema Form Editor.

The goal is to evolve the current implementation into a:

- headless
- event-driven
- state-driven
- UI-agnostic
- highly testable

editor platform.

The UI must become a thin human interaction layer.

The core must own:

- state
- schema compilation
- mutation
- validation
- persistence
- orchestration

The UI must only:

- render state
- dispatch user intent

---

# 2. Primary Architectural Goal

The editor must become:

```txt
UI -> Commands -> Core -> State Update -> Persistence -> State Emission -> UI Update
```

The core is the source of truth.

The UI is not the source of truth.

---

# 3. Architectural Principles

## 3.1 Headless Core

The core must work without Lit, DOM, or browser rendering.

The core must be executable:

- in tests
- in automation
- in scripts
- in future alternate UIs

The core must never:

- query DOM
- manipulate DOM
- depend on Lit
- depend on browser rendering

---

## 3.2 UI as Interaction Layer

The UI exists only to:

- display state
- collect human interaction
- dispatch commands to the core

The UI must not:

- mutate state directly
- call persistence directly
- perform business logic
- contain schema logic

---

## 3.3 Commands In, State Out

The architecture must follow:

```txt
commands in
state out
```

The UI dispatches commands.

The core updates state.

The UI rerenders from state snapshots.

---

## 3.4 Single Source of Truth

The core owns:

- schema state
- form model
- runtime values
- validation state
- saving state
- permissions
- selection state

Components must never own canonical data.

---

## 3.5 State Down, Events Up

Components receive:

- state
- field metadata
- validation data

Components emit:

- user intent

Example:

```js
{
  type: "field.change",
  pointer: "/contacts/0/name",
  value: "Alice"
}
```

---

# 4. Desired High-Level Architecture

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
│  Validation         │
│  Mutation Engine    │
│  Persistence        │
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

# 5. Core Responsibilities

The core must own all application logic.

---

## 5.1 Schema Compilation

Input:

- JSON Schema

Output:

- normalized internal form model

The UI must never consume raw schema directly.

---

## 5.2 Form Model Creation

The core builds runtime form instances using:

```txt
schema + existing json
```

The runtime model must:

- instantiate arrays
- instantiate nested objects
- preserve stable IDs
- generate defaults

---

## 5.3 State Management

The core owns:

- current JSON values
- validation errors
- save state
- selection state
- permissions
- active nodes

The core is the canonical state container.

---

## 5.4 Validation

The core validates:

- fields
- objects
- arrays
- cross-field rules

Validation results are normalized.

Example:

```js
{
  pointer: "/contacts/0/name",
  message: "Required"
}
```

---

## 5.5 Mutation

The core owns all mutations.

Examples:

- field changes
- array item add/remove
- reorder
- object creation
- value replacement

The UI must never mutate JSON directly.

---

## 5.6 Persistence

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

The UI never calls APIs directly.

---

## 5.7 Permission Checks

Permission checks belong to the core and API boundary.

The UI only receives:

- readonly state
- disabled state
- capability flags

---

# 6. Command System

The UI communicates with the core exclusively using commands.

---

## 6.1 Command Shape

Example:

```js
{
  type: "field.change",
  pointer: "/contacts/0/name",
  value: "Alice"
}
```

---

## 6.2 Array Commands

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

---

## 6.3 Command Rules

Commands:

- express intent only
- never manipulate DOM
- never contain UI logic
- never directly mutate state

---

# 7. State System

The core emits state updates.

The UI subscribes to state changes.

---

## 7.1 State Must Be Serializable

Core state should remain serializable and deterministic.

Avoid:

- DOM references
- component references
- Lit-specific structures

---

## 7.2 State Shape

State includes:

- form model
- values
- errors
- saving status
- selection state
- permissions

---

# 8. JSON Pointer

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

---

# 9. Arrays

Arrays require special handling.

---

## 9.1 Important Rule

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

---

## 9.2 Array Responsibilities

The core must manage:

- add
- remove
- reorder
- stable IDs
- item instantiation

---

# 10. UI Responsibilities

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

---

# 11. Lit Responsibilities

Lit components should remain:

- mostly dumb
- reactive
- isolated

Components:

- receive props/state
- emit commands upward

Components should not:

- mutate shared state
- call APIs
- contain orchestration logic

---

# 12. Controller Responsibilities

Controllers are UI adapters between Lit and the core.

Controllers:

- bind UI to core
- subscribe to state
- dispatch commands
- trigger rerenders

Controllers must not:

- implement business logic
- own persistence logic
- own validation logic

---

# 13. Services

Services belong inside the core.

Services:

- are framework-independent
- contain reusable logic
- contain business rules

Examples:

- schema compiler
- validation engine
- mutation engine
- persistence service

---

# 14. Strict Dependency Direction

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

# 15. Important Non-Negotiable Rules

## NEVER:

- let components mutate state directly
- let UI call persistence directly
- let UI own business logic
- let services depend on Lit
- let core depend on DOM
- let raw schema leak into field components

---

## ALWAYS:

- use commands
- use state subscriptions
- use JSON Pointer as canonical addressing
- keep persistence inside the core
- keep validation inside the core
- keep schema logic inside the core

---

# 16. Target Core API

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

---

# 17. Target Package Structure

```txt
packages/
  core/
    schema/
    model/
    validation/
    mutation/
    persistence/
    state/

  ui-lit/
    components/
    controllers/
    bindings/

  app/
    bootstrap.js
```

---

# 18. Migration Strategy

The migration should be incremental.

Do NOT rewrite everything.

---

## Step 1

Strengthen the core boundary.

Move:

- mutation
- validation
- persistence
- orchestration

fully into the core.

---

## Step 2

Introduce command dispatching.

Replace:

- direct service calls from UI

with:

- commands sent to the core.

---

## Step 3

Introduce state subscriptions.

The UI rerenders from emitted state snapshots.

---

## Step 4

Reduce controller complexity.

Controllers become thin adapters.

---

## Step 5

Remove remaining DOM-aware orchestration from non-UI layers.

The core becomes fully headless.

---

# 19. Important Outcome

The final architecture must allow:

- multiple UIs
- headless execution
- deterministic testing
- automation
- future extensibility

without changing the core logic.

The core must become:

- stable
- deterministic
- framework-independent
- reusable

The UI must become:

- thin
- reactive
- replaceable

---

# 20. Final Architectural Summary

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

The UI owns:

- rendering
- interaction

Commands flow inward.

State flows outward.

This separation is the most important architectural direction and must not be violated.
