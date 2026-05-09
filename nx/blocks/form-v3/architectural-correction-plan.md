# Form V3 — Refactoring & Architecture Correction Plan

# 1. Purpose

This document defines the required architectural corrections and refactoring goals for Form V3.

The current implementation already follows the intended architecture in many areas, but several important architectural leaks and structural issues still exist.

This document defines:

- what must change
- why it must change
- what must remain unchanged
- the architectural direction that must be preserved

This document is intended to guide implementation work performed by coding agents and developers.

---

# 2. Current Architectural Status

The current implementation already contains the correct high-level layers:

```txt
app/
core/
ui-lit/
```

The project already successfully separates:

- schema handling
- runtime model generation
- mutation
- validation
- persistence
- rendering

This is a strong foundation.

However, the architecture is not yet fully aligned with the target design because:

- UI interaction state still leaks into the core
- the core still owns some UI concerns
- orchestration responsibilities are too centralized
- state structure is too coarse
- unsupported schema behavior is too permissive

---

# 3. Most Important Architectural Correction

## Core must own canonical document state only

The core must own:

- document JSON
- schema-derived form model
- validation
- persistence
- loading state
- compatibility state
- permission state

The core must NOT own:

- active item
- focused field
- sidebar selection
- expanded/collapsed sections
- scroll position
- reorder dialog state
- temporary interaction state

These are UI concerns.

---

# 4. Required State Separation

## 4.1 Core State

Core state must contain only canonical editor state.

Examples:

```txt
document values
runtime model
validation errors
loading state
saving state
permission state
compatibility state
last persistence error
last command result
```

The core state must remain:

- headless
- deterministic
- serializable
- UI-independent

---

## 4.2 UI State

UI state must live outside the core.

UI state includes:

```txt
active pointer
focused field
hover state
expanded sections
sidebar selection
scroll sync state
drag/reorder interaction state
dialog visibility state
temporary keyboard navigation state
```

UI state belongs to:

- ui-lit/controllers
- ui-lit local stores
- component-local state

The core must never require UI state to operate correctly.

---

# 5. Commands Must Be Explicit

Commands must always carry explicit pointers and intent.

Good:

```js
{
  type: "array.remove",
  pointer: "/contacts/2"
}
```

Bad:

```js
{
  type: "array.remove";
}
```

with the expectation that the core remembers the selected item.

The core must never depend on implicit UI selection state.

---

# 6. Required Changes

# 6.1 Remove Selection State from Core

## Current Problem

The core currently stores:

- `selection.activePointer`
- `selection.origin`
- `selection.sequence`

This creates coupling between:

- rendering
- navigation
- interaction
- core document logic

This violates the headless-core architecture.

---

## Required Fix

Remove selection state from:

- `core/state/state-store.js`
- `core/form-core.js`

Move selection state into:

- `ui-lit/controllers`
- or a dedicated UI-local state store

The core must not know:

- which field is focused
- which item is visually active
- where the sidebar cursor is
- what the scroll target is

---

# 6.2 Introduce Dedicated UI State

Create a UI-only state layer.

Suggested structure:

```txt
ui-lit/
  state/
    ui-state.js
```

Suggested responsibilities:

```txt
active pointer
focus state
expanded/collapsed state
scroll sync state
sidebar selection
drag/reorder interaction state
```

This state must never become part of the core state.

---

# 6.3 Keep the Core Fully Headless

The core must remain executable:

- without Lit
- without browser rendering
- without DOM
- without visual selection state

The core must never:

- query DOM
- depend on focus state
- depend on scroll state
- depend on rendering state

The core must work:

- in tests
- in CLI mode
- in automation
- in alternate UIs

---

# 6.4 Reduce Responsibility Concentration in form-core.js

## Current Problem

`core/form-core.js` currently handles:

- loading
- validation
- persistence
- mutation
- save sequencing
- compatibility checks
- selection handling
- state orchestration
- command dispatch

This file is becoming too central.

---

## Required Direction

`form-core.js` should remain the public core entry point, but internal responsibilities should be separated more clearly.

The following concerns should become more isolated:

```txt
loading pipeline
validation pipeline
save sequencing
compatibility checks
mutation coordination
state transitions
```

This does NOT require many files immediately.

It DOES require cleaner internal responsibility separation.

---

# 6.5 Split Core State into Explicit Slices

## Current Problem

The current state object mixes many unrelated concerns.

This increases accidental coupling.

---

## Required Direction

Separate state conceptually into slices.

Suggested slices:

```txt
document
model
validation
loading
saving
permissions
compatibility
errors
```

UI state must remain outside this structure.

---

# 6.6 Make Unsupported Schema Behavior Explicit

## Current Problem

Unsupported or incomplete schemas may silently degrade.

Examples:

- unknown schema shapes becoming `"string"`
- unsupported combinators partially compiling

This creates unpredictable behavior.

---

## Required Fix

Unsupported schema features must:

- fail explicitly
- report compatibility errors
- surface clear editor limitations

The editor must never silently pretend unsupported structures are valid.

---

# 6.7 Clarify Runtime Value Semantics

The runtime model currently contains:

- source values
- effective values
- default values

These concepts must be explicitly documented and preserved.

Definitions:

```txt
sourceValue
  = value loaded from persisted JSON

defaultValue
  = schema-derived fallback

effectiveValue
  = value currently displayed by the UI
```

This distinction is important for:

- persistence
- validation
- default rendering
- empty values
- array instantiation

---

# 6.8 Isolate Save Sequencing

The current save sequencing behavior is correct in principle.

However, sequencing logic should become more isolated from the main orchestration flow.

Required behavior:

```txt
older save responses must never overwrite newer edits
```

This rule is non-negotiable.

---

# 6.9 Keep app/form-v3.js Thin

## Current Problem

`form-v3.js` currently performs:

- bootstrapping
- context loading
- schema selection
- view-state mapping
- screen state coordination

This risks turning the shell into a second orchestrator.

---

## Required Direction

`form-v3.js` should remain:

- bootstrap layer
- application shell
- external entry point

It should NOT become:

- interaction orchestrator
- validation coordinator
- state manager
- selection manager

---

# 6.10 Keep UI Controllers Thin

`ui-lit/controllers/*` should remain:

- UI adapters
- command forwarders
- state subscribers

They must not become:

- validation engines
- persistence orchestrators
- schema interpreters
- document state owners

---

# 7. Architecture Rules That Must Not Be Violated

## NEVER

- store UI interaction state in the core
- let the core depend on DOM or rendering
- let the UI mutate document state directly
- let UI components call persistence directly
- let unsupported schemas silently degrade
- allow stale save responses to overwrite newer state
- make commands depend on implicit selection state

---

## ALWAYS

- keep the core headless
- keep UI state local to the UI layer
- use explicit pointer-based commands
- keep persistence inside the core
- keep validation inside the core
- use JSON Pointer as canonical addressing
- preserve stable IDs for arrays
- keep the UI replaceable
- keep state transitions deterministic

---

# 8. Structural Direction

The target architecture remains:

```txt
HEADLESS CORE
+
THIN REACTIVE UI
```

The core owns:

- state
- mutation
- validation
- persistence
- orchestration
- compatibility
- permissions

The UI owns:

- rendering
- interaction
- focus
- selection
- navigation
- scroll behavior

Commands flow inward.

State flows outward.

This separation is the most important architectural rule and must not be violated.

---

# 9. Refactoring Priorities

## Highest Priority

1. Remove selection state from the core
2. Introduce UI-local interaction state
3. Keep commands pointer-explicit
4. Keep the core fully headless

---

## Medium Priority

5. Split state into explicit slices
6. Isolate save sequencing
7. Reduce responsibility concentration in `form-core.js`
8. Clarify runtime value semantics

---

## Lower Priority

9. Optimize state cloning
10. Add reducer-style command handling
11. Further modularize orchestration internally

---

# 10. Final Goal

The final architecture must allow:

- alternate UIs
- deterministic tests
- CLI execution
- automation
- future extensibility

without changing the core logic.

The core must become:

- stable
- deterministic
- UI-independent
- reusable
- testable without rendering

The UI must become:

- thin
- reactive
- replaceable
- interaction-focused

This is the required architectural direction for all future implementation work.
