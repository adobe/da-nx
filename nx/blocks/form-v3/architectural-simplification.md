# Form V3 — Simplification & Refactoring Guidelines

# 1. Purpose

This document defines the required simplification strategy for Form V3.

The current architecture is already structurally correct:

- app/
- core/
- ui-lit/

The goal is NOT to redesign the architecture.

The goal is:

- preserve the architectural boundaries
- preserve the headless core
- preserve the UI/core separation
- reduce implementation complexity
- reduce abstraction overhead
- improve maintainability
- improve readability
- make the project easier for the team to understand

This document defines:

- what must stay
- what should be simplified
- what abstractions are unnecessary
- how the agent should proceed

---

# 2. Important Architectural Rule

The simplification effort MUST NOT destroy the core architecture.

The architecture MUST remain:

```txt
HEADLESS CORE
+
THIN REACTIVE UI
```

The simplification must:

- reduce complexity
- reduce abstraction
- reduce file count where reasonable

WITHOUT:

- mixing concerns
- leaking UI state into core
- coupling core to Lit
- coupling core to DOM

---

# 3. Architecture That MUST Remain

## app/

Responsibilities:

- bootstrapping
- external integration
- boundary adaptation
- environment/context loading

Examples:

- document loading
- schema loading
- HTML ↔ JSON conversion
- resource access

The app layer is correct and should remain.

---

## core/

Responsibilities:

- canonical document state
- runtime model
- mutation
- validation
- persistence policy
- compatibility checks
- authorization
- orchestration

The core must remain:

- headless
- UI-independent
- DOM-independent
- reusable by CLI/tests/automation

---

## ui-lit/

Responsibilities:

- rendering
- interaction
- UI-only state
- focus/navigation/selection
- command dispatching

The UI layer must remain:

- reactive
- mostly dumb
- thin

---

# 4. Core Architectural Rules That MUST NOT Be Violated

## NEVER

- move UI interaction state into the core
- let core depend on Lit
- let core depend on DOM
- let UI mutate document state directly
- let UI call persistence directly
- let commands depend on implicit selection state
- let unsupported schema silently degrade

---

## ALWAYS

- keep the core headless
- keep commands explicit
- keep JSON Pointer canonical
- keep UI interaction state local to UI
- keep persistence inside the core
- keep validation inside the core

---

# 5. Main Simplification Strategy

The architecture should remain layered, but the implementation should become flatter and easier to reason about.

The simplification effort should:

- reduce unnecessary wrappers
- reduce thin abstractions
- reduce plumbing
- reduce indirection
- merge files when separation adds little value

The simplification effort should NOT:

- collapse the architecture into one layer
- remove the core/UI separation
- move business logic into UI

---

# 6. Simplification Priorities

# 6.1 Simplify Persistence

## Current Situation

`persistence-service.js` is currently relatively thin.

It mostly acts as orchestration around persistence callbacks.

---

## Required Direction

Persistence should remain inside the core, but the implementation should become simpler.

The persistence layer should become:

- small
- explicit
- easy to understand

The core only needs:

- persist(document)
- save sequencing
- error handling

It does NOT need:

- heavy service abstractions
- deep layering
- unnecessary wrapper classes

---

## Recommended Direction

Prefer:

- small functions
- small modules
- explicit flow

Over:

- abstraction-heavy services

---

# 6.2 Simplify State Management

## Current Situation

The code currently contains:

- state-store.js
- state-stream.js

This creates extra mental overhead.

---

## Required Direction

Reduce state complexity.

Prefer:

- one simple store
- one subscription mechanism
- one explicit state object

The store only needs:

```js
getState();
setState();
subscribe();
```

The architecture does NOT require:

- Redux-like complexity
- multiple store layers
- deep event systems

---

## Important Rule

Core state and UI state must remain separated.

Simplifying state must NOT reintroduce UI state into the core.

---

# 6.3 Simplify form-core.js

## Current Situation

`form-core.js` still carries many responsibilities.

However, splitting everything into many small files would also increase complexity.

---

## Required Direction

Keep:

- one main core entry point

But:

- reduce orchestration complexity
- simplify command handling
- simplify state transitions

The goal is:

- easier to read
- easier to debug
- easier to understand

NOT:

- maximum abstraction purity

---

## Recommended Direction

Prefer:

- explicit functions
- explicit flows
- readable orchestration

Over:

- deeply layered pipelines
- excessive indirection
- unnecessary abstraction

---

# 6.4 Simplify Pointer Handling

## Current Situation

The code contains:

- json-pointer.js
- definition-pointer.js

---

## Required Direction

Only keep multiple pointer systems if they are truly necessary.

If the distinction is weak or confusing:

- merge concepts
- simplify lookup logic

The canonical pointer system should remain:

- RFC 6901 JSON Pointer

---

# 6.5 Simplify Runtime Model Logic

The runtime model system is already relatively good.

Do NOT over-engineer it further.

The runtime model only needs:

- stable IDs
- pointer lookup
- runtime values
- schema-derived structure

Avoid:

- excessive metadata
- unnecessary abstractions
- deeply nested helper layers

---

# 6.6 Keep UI State Local and Simple

UI interaction state should remain:

- local to ui-lit
- small
- explicit

Examples:

- active pointer
- focus state
- expanded/collapsed sections
- sidebar selection
- reorder dialog state

This state does NOT need:

- complex orchestration
- deep stores
- core synchronization

The UI should simply:

- subscribe to core state
- maintain local interaction state
- rerender

---

# 6.7 Reduce Boilerplate

The simplification effort should aggressively remove:

- trivial wrappers
- pass-through layers
- unnecessary abstractions
- one-method services
- thin indirection files

If a file exists only to forward a call:

- strongly consider merging it

---

# 7. Complexity Reduction Philosophy

The team prefers simplicity.

Therefore:

## Prefer

- explicit code
- readable flows
- fewer files
- direct orchestration
- small utilities
- small modules

---

## Avoid

- architecture astronaut patterns
- enterprise layering
- deep indirection
- unnecessary abstraction purity
- excessive service decomposition

---

# 8. What MUST Stay Despite Simplification

The following architectural decisions are correct and must remain:

## MUST REMAIN

```txt
app/
core/
ui-lit/
```

---

## MUST REMAIN

```txt
headless core
```

---

## MUST REMAIN

```txt
UI state outside the core
```

---

## MUST REMAIN

```txt
commands -> core -> state updates
```

---

## MUST REMAIN

```txt
explicit JSON Pointer addressing
```

---

## MUST REMAIN

```txt
immediate persistence
```

---

## MUST REMAIN

```txt
stable IDs for arrays
```

---

# 9. Simplification Rules

## Merge files when:

- they are tightly coupled
- they are small
- separation adds little value
- abstraction adds confusion

---

## Keep files separate when:

- responsibilities are truly different
- separation improves clarity
- logic is reusable
- logic is independently testable

---

# 10. Recommended Simplified Mental Model

The project should become mentally understandable as:

```txt
app/
  = external world + bootstrapping

core/
  = editor engine

ui-lit/
  = rendering + interaction
```

The architecture should feel:

- obvious
- direct
- readable
- predictable

---

# 11. Simplified Core Design Goal

The core should eventually feel like:

```js
const core = createFormCore({
  loadDocument,
  persistDocument,
  schemaRegistry
});

await core.load(...);

core.dispatch({
  type: "field.change",
  pointer: "/title",
  value: "Hello"
});

core.subscribe(render);
```

The core should remain:

- small
- explicit
- deterministic
- reusable

---

# 12. Simplified UI Design Goal

The UI should eventually feel like:

```txt
render state
dispatch commands
maintain local interaction state
```

Nothing more.

The UI should not:

- own business rules
- own validation
- own persistence
- own mutation logic

---

# 13. Final Simplification Goal

The final architecture should be:

```txt
SMALL HEADLESS CORE
+
SMALL REACTIVE UI
```

The architecture should remain:

- modular
- layered
- reusable

But the implementation should become:

- smaller
- flatter
- easier to understand
- easier to debug
- easier for the team to maintain

This is the required simplification direction for all future implementation work.
