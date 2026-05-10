# Form V3 — Core/UI Communication Simplification Guidelines

# 1. Purpose

This document defines the required simplification of the core/UI communication model.

The current architecture already correctly separates:

- app/
- core/
- ui-lit/

The goal is NOT to redesign the architecture.

The goal is:

- simplify communication
- reduce abstraction
- reduce mental overhead
- make the system easier to understand and maintain
- preserve the headless core architecture

---

# 2. Current Problem

The current communication flow is too layered and feels more complex than necessary.

Current flow:

```txt
UI event
→ controller
→ dispatch(command)
→ state stream
→ subscription
→ binding layer
→ rerender
```

This creates the impression of:

- event buses
- Redux-style systems
- reactive stream architectures
- pub/sub complexity

Even though the implementation is actually much simpler.

The current naming (`dispatch`, `subscribe`, `onChange`) also reinforces this misunderstanding.

For a small team, this creates unnecessary mental overhead.

---

# 3. Required Simplification

The architecture must become:

```txt
UI calls core method
→ core updates state
→ core returns updated snapshot
→ UI rerenders
```

This is the target communication model.

---

# 4. Core API Direction

The core should expose explicit command methods instead of:

- generic dispatch
- generic event systems
- subscriptions
- state streams

---

# 5. Required Core API Shape

The core should expose methods like:

```js
await core.load({
  schema,
  document,
  permissions,
});

await core.setFieldValue(pointer, value);

await core.addArrayItem(pointer);

await core.removeArrayItem(pointer);

await core.moveArrayItem(pointer, fromIndex, toIndex);

const state = core.getState();
```

This becomes the public API surface.

---

# 6. Remove Generic Dispatch API

## REMOVE

```js
core.dispatch(command);
```

This naming strongly suggests:

- Redux
- event systems
- message buses
- CQRS/event-driven architecture

This is NOT the intended architecture.

---

## REPLACE WITH

Explicit methods:

```js
core.setFieldValue(...)
core.addArrayItem(...)
core.removeArrayItem(...)
core.moveArrayItem(...)
```

This is:

- simpler
- safer
- easier to understand
- easier to autocomplete
- easier to refactor
- easier for small teams to maintain

---

# 7. Remove Subscription API

## REMOVE

```js
core.subscribe(listener);
core.onChange(listener);
```

The architecture no longer needs:

- subscriptions
- state streams
- push-based state propagation

---

# 8. Remove State Stream Layer

The following complexity should be removed:

```txt
state-stream.js
subscription layers
binding forwarding layers
push-based propagation
```

The architecture should become direct and pull-based.

---

# 9. New State Flow

The UI owns rerender timing.

The flow becomes:

```js
const nextState = await core.setFieldValue(pointer, value);

render(nextState);
```

Or:

```js
await core.setFieldValue(pointer, value);

const nextState = core.getState();

render(nextState);
```

Both are acceptable.

---

# 10. Core Responsibilities

The core remains:

- headless
- stateful
- reusable
- deterministic

The core still owns:

- canonical document state
- validation
- mutation
- persistence
- compatibility
- authorization

This simplification MUST NOT move business logic into the UI.

---

# 11. UI Responsibilities

The UI remains:

- rendering layer
- interaction layer
- UI-local state owner

The UI:

- calls core methods
- receives updated state
- rerenders explicitly

The UI does NOT:

- own canonical document state
- perform mutation logic
- perform validation
- perform persistence

---

# 12. Important Architectural Clarification

The architecture is NOT an event-driven system.

It is:

```txt
stateful engine
+
explicit operations
+
explicit snapshots
```

The architecture is NOT:

- Redux
- RxJS
- Pub/Sub
- CQRS
- event bus architecture

This distinction is important and must remain clear.

---

# 13. Required Simplifications

## REMOVE

```txt
dispatch
subscribe
onChange
state streams
binding forwarding layers
push-based update propagation
```

---

## KEEP

```txt
headless core
explicit command methods
getState()
UI-local interaction state
canonical core state
explicit JSON Pointer addressing
```

---

# 14. Controller Simplification

The controller layer should become much smaller.

The controller should only:

- call core methods
- maintain UI-local state
- pass updated state into rendering

The controller should NOT:

- manage subscriptions
- manage streams
- forward state callbacks
- behave like a reactive pipeline

---

# 15. Recommended Final Communication Flow

The final communication flow should become:

```txt
UI interaction
→ controller/UI handler
→ core method call
→ core updates state
→ core returns updated snapshot
→ UI rerenders
```

Nothing more.

---

# 16. Important Benefits

This simplification:

- preserves the headless core
- preserves CLI compatibility
- preserves testability
- preserves UI/core separation

while:

- dramatically reducing complexity
- reducing abstraction overhead
- reducing file count
- reducing mental overhead
- improving readability
- improving maintainability

---

# 17. Final Goal

The final architecture should feel like:

```txt
SMALL STATEFUL ENGINE
+
THIN UI
```

The system should feel:

- direct
- explicit
- predictable
- easy to debug
- easy to understand

This is the required simplification direction for future implementation work.
