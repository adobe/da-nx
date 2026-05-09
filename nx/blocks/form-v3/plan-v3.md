# Form V3 Implementation Plan (Strict to `architectural-design-form-v3.md`)

## Source of Truth

This plan is derived strictly from:

- `nx/blocks/form-v3/architectural-design-form-v3.md`

No scope, behavior, or layering outside that document is introduced here.

## Goal

Implement `nx/blocks/form-v3` as:

- a headless, event-driven, state-driven core
- a thin reactive UI adapter
- a strict `commands in, state out` system

while preserving the non-negotiable architectural rules.

## Non-Negotiable Constraints (Must Always Hold)

- Core is the source of truth for canonical state.
- UI is a pure interaction/rendering layer.
- UI must not mutate JSON, persist, validate, compile schema, or run permission/compatibility logic.
- Core must be headless (no Lit/DOM dependencies).
- Raw schema must not leak into leaf UI.
- Persistence is immediate (no draft state).
- JSON Pointer (RFC 6901) is the canonical logical address.
- Arrays use positional pointers for addressing and stable IDs for rendering identity.
- Unsupported schema/features must fail explicitly (no silent fallback unless product rules define one).
- Stale save responses must never overwrite newer state.
- Dependency direction is one-way only:
  - UI -> Controllers -> Core API -> Services -> Model

## Target Architecture Boundary

The implementation boundary must expose a core API equivalent to:

- `core.load({ schema, document, permissions })`
- `core.dispatch(command)`
- `core.subscribe(listener)`
- `core.getState()`

The UI may only use this boundary.

## Target Structure in `nx/blocks/form-v3`

Use the architecture's target split directly under `form-v3` (no extra `packages` directory layer):

- `nx/blocks/form-v3/core/schema/`
- `nx/blocks/form-v3/core/model/`
- `nx/blocks/form-v3/core/validation/`
- `nx/blocks/form-v3/core/mutation/`
- `nx/blocks/form-v3/core/persistence/`
- `nx/blocks/form-v3/core/state/`
- `nx/blocks/form-v3/core/authorization/`
- `nx/blocks/form-v3/ui-lit/components/`
- `nx/blocks/form-v3/ui-lit/controllers/`
- `nx/blocks/form-v3/ui-lit/bindings/`
- `nx/blocks/form-v3/app/bootstrap.js`

Module responsibilities must follow section 19 of the architecture doc exactly.

## Core State Contract (Required Shape)

Core state must remain serializable and include explicit status fields for:

- form model
- values
- errors
- saving status
- loading status
- selection
- permissions
- compatibility status
- last command result
- last persistence error

Core state must not include DOM/component references or Lit-specific structures.

## Command Contract (Required Intent API)

UI communicates with core exclusively via commands such as:

- `field.change`
- `array.add`
- `array.remove`
- `array.move`

Commands express intent only and never include UI logic, DOM coupling, or direct state mutation.

## Step-by-Step Implementation Plan (Fixed Order, No Reordering)

### Step 1 - Strengthen the Core Boundary

Implement:

- Core module skeleton and public core API boundary.
- Move mutation, validation, persistence, and orchestration ownership fully into core modules.
- Ensure UI/controllers no longer own these concerns.

Completion criteria:

- All business logic exists in core services.
- UI layer does not call persistence/mutation/validation logic directly.
- Core logic in this step is executable without Lit/DOM.

### Step 2 - Introduce Command Dispatching

Implement:

- Command dispatcher in core.
- Command handling pipeline (intent -> state transition flow).
- Replace direct UI-triggered service calls with `core.dispatch(command)`.

Completion criteria:

- UI sends commands only.
- Command handlers own state transitions via core pipeline.
- No direct service orchestration from UI/controllers remains.

### Step 3 - Introduce State Subscriptions

Implement:

- Core state stream/subscription mechanism.
- Snapshot access via `core.getState()`.
- UI rerender path based on emitted state snapshots only.

Completion criteria:

- UI subscription drives rerendering.
- State transitions are explicit and centralized.
- State remains serializable and deterministic.

### Step 4 - Reduce Controller Complexity

Implement:

- Controllers as thin UI adapters only.
- Controller responsibilities limited to subscribe/dispatch/rerender bridge.

Completion criteria:

- Controllers contain no business logic.
- Controllers contain no persistence, validation, or schema logic.
- Controllers only translate UI interactions into commands.

### Step 5 - Remove DOM-Aware Orchestration from Non-UI Layers

Implement:

- Remove remaining DOM/Lit dependencies from core and services.
- Keep DOM-aware behavior only in UI/app bootstrap layers.

Completion criteria:

- Core/services are fully headless.
- Core can execute in tests/automation without browser rendering.
- Services remain framework-independent and reusable.

### Step 6 - Make Unsupported/Blocked States Explicit

Implement:

- Explicit compatibility and support checks in core.
- Explicit permission/access evaluation in core.
- Explicit status/error emission for unsupported schema, invalid document, permission denied, save failure, and incompatible structure.

Completion criteria:

- Unsupported constructs are reported explicitly.
- UI renders explicit states; UI does not infer status heuristically.
- No silent fallback behavior unless explicitly product-defined.

### Step 7 - Add Save Sequence Protection

Implement:

- Save sequence/version tracking in persistence flow.
- Stale response protection that discards out-of-order save completions.

Completion criteria:

- Older save responses cannot overwrite newer edits.
- Newest local authoritative state is preserved under rapid edits.

## Acceptance Criteria Gate (Must Be True Before Declaring V3 Ready)

All must be true:

- Core runs without Lit/DOM.
- Core is testable without DOM.
- UI is replaceable without rewriting core.
- UI dispatches commands only.
- Core owns state and persistence.
- JSON Pointer is canonical address system.
- Arrays have stable render IDs.
- Loading/saving/permission/compatibility are explicit state.
- Unsupported schema features are explicit.
- Stale save responses are ignored.
- Raw schema does not leak into leaf components.

## Execution Protocol for This Chat

Implementation must proceed strictly one step at a time:

1. Implement current step only.
2. Verify completion criteria for that step.
3. Report what changed and evidence that criteria pass.
4. Pause and request confirmation before starting the next step.

No next step starts without explicit confirmation.
