# Form V3 Simplification Plan (New-1, Strict)

## Source of Truth

This plan is derived strictly from:

- `nx/blocks/form-v3/architecture-simplification-new-1.md`

No redesign is introduced.  
The architecture separation remains:

- `app/`
- `core/`
- `ui-lit/`

## Mandatory Execution Protocol

Each step must be executed in isolation and in this exact order:

1. Implement only the current step scope.
2. Run the step verification checks.
3. Report changed files and verification outcome.
4. Ask the step confirmation prompt exactly.
5. Wait for explicit confirmation before starting the next step.

## Non-Negotiable Target (From the Source Doc)

### REMOVE

- `dispatch`
- `subscribe`
- `onChange`
- state-stream style propagation
- binding forwarding layers
- push-based update propagation

### KEEP

- headless core
- explicit core methods
- `getState()`
- UI-local interaction state
- canonical core state
- explicit JSON Pointer addressing

### Required Final Flow

```txt
UI interaction
-> controller/UI handler
-> core method call
-> core updates state
-> core returns updated snapshot
-> UI rerenders
```

## Step-by-Step Plan (Fixed Order)

### Step 1 - Define Explicit Core Operation Methods (Sections 4, 5, 6)

**Goal**

Make explicit core methods the primary API surface for mutations.

**Files**

- `nx/blocks/form-v3/core/form-core.js`
- `test/form-v3/core/form-core.test.js`
- `test/form-v3/core/core-headless-boundary.test.js`

**Changes**

- Add/normalize explicit methods on `core`:
  - `load({ schema, document, permissions })` (preserve existing behavior; accept optional `permissions`)
  - `setFieldValue(pointer, value)`
  - `addArrayItem(pointer)`
  - `removeArrayItem(pointer)`
  - `moveArrayItem(pointer, fromIndex, toIndex)`
  - `getState()`
- Ensure each mutation method updates canonical core state and returns the updated snapshot.
- Keep business logic (validation, mutation, persistence, authorization compatibility) in core.

**Verification**

- Core mutation behavior remains deterministic.
- Persistence behavior remains unchanged for successful and failed saves.
- Returned snapshots are immutable from external callers.

**Confirmation prompt**

`Step 1 complete. Proceed to Step 2 (controller direct core method calls)?`

---

### Step 2 - Simplify Controller to Direct Core Method Calls (Sections 3, 9, 14, 15)

**Goal**

Make controller a thin UI handler that calls explicit core methods and maintains UI-local state only.

**Files**

- `nx/blocks/form-v3/ui-lit/controllers/form-controller.js`
- `nx/blocks/form-v3/ui-lit/controllers/intent-command-map.js`
- `nx/blocks/form-v3/ui-lit/state/ui-state.js`
- `test/form-v3/core/form-controller.test.js`

**Changes**

- Replace generic controller `dispatch(...)` routing with explicit method routing.
- Map intents directly to core methods:
  - field change -> `core.setFieldValue(...)`
  - array add -> `core.addArrayItem(...)`
  - array remove -> `core.removeArrayItem(...)`
  - array reorder -> `core.moveArrayItem(...)`
- Keep selection/navigation state in UI-local state only.
- Controller returns explicit snapshots for UI rerender timing.

**Verification**

- Selection intents do not mutate core state.
- Non-selection intents call explicit core methods directly.
- Debounce behavior (if retained) still produces correct final state.

**Confirmation prompt**

`Step 2 complete. Proceed to Step 3 (remove core dispatch API)?`

---

### Step 3 - Remove Generic Dispatch API from Core Boundary (Sections 6, 12, 13)

**Goal**

Remove `core.dispatch(command)` from public architecture.

**Files**

- `nx/blocks/form-v3/core/form-core.js`
- `nx/blocks/form-v3/form-v3.js`
- `test/form-v3/core/form-core.test.js`
- `test/form-v3/core/core-headless-boundary.test.js`

**Changes**

- Remove `dispatch` from returned core API.
- Remove generic command parsing as public entry behavior.
- Update all call sites/tests to explicit method usage.
- Ensure architecture language and code no longer imply event bus / Redux-like flow.

**Verification**

- No production path calls `core.dispatch(...)`.
- Core boundary exposes explicit methods + `getState()`.
- Core remains headless and UI-agnostic.

**Confirmation prompt**

`Step 3 complete. Proceed to Step 4 (remove subscription and push propagation)?`

---

### Step 4 - Remove Subscription APIs and Push-Based Propagation (Sections 7, 8, 9, 13, 14)

**Goal**

Eliminate subscription-based state propagation and binding forwarding layers.

**Files**

- `nx/blocks/form-v3/core/state/state-store.js`
- `nx/blocks/form-v3/core/form-core.js`
- `nx/blocks/form-v3/ui-lit/state/ui-state.js`
- `nx/blocks/form-v3/ui-lit/controllers/form-controller.js`
- `nx/blocks/form-v3/ui-lit/bindings/state-binding.js`
- `nx/blocks/form-v3/app/bootstrap.js`
- `nx/blocks/form-v3/form-v3.js`
- `test/form-v3/core/form-core.test.js`
- `test/form-v3/core/form-controller.test.js`

**Changes**

- Remove `core.subscribe(...)` / `core.onChange(...)` style API.
- Remove controller subscription APIs and callback forwarding.
- Remove binding forwarding layer (`state-binding`) and any push pipeline behavior.
- Move UI rerender timing to explicit pull flow:
  - await core method
  - get returned snapshot (or `core.getState()`)
  - rerender

**Verification**

- No `subscribe`/`onChange` dependency remains in form-v3 runtime code.
- UI rerenders from explicit handler flow only.
- Core state remains canonical; UI state remains local.

**Confirmation prompt**

`Step 4 complete. Proceed to Step 5 (bootstrap and shell simplification)?`

---

### Step 5 - Simplify App Bootstrap and Shell Wiring (Sections 9, 11, 14, 15, 17)

**Goal**

Keep the runtime wiring direct: UI handler -> core call -> snapshot -> rerender.

**Files**

- `nx/blocks/form-v3/app/bootstrap.js`
- `nx/blocks/form-v3/form-v3.js`
- `nx/blocks/form-v3/ui-lit/controllers/form-controller.js`
- `test/form-v3/core/form-controller.test.js`

**Changes**

- Remove indirection that exists only to forward snapshots.
- Make form shell update `_state` from explicit controller/core responses.
- Keep controller responsibilities limited to:
  - calling core methods
  - maintaining UI-local state
  - returning composed snapshot for render

**Verification**

- Form still loads, mutates, saves, and rerenders correctly.
- Runtime flow is directly traceable without reactive pipeline concepts.

**Confirmation prompt**

`Step 5 complete. Proceed to Step 6 (final cleanup and acceptance gate)?`

---

### Step 6 - Final Cleanup and Acceptance Gate (Sections 10, 11, 12, 13, 16, 17)

**Goal**

Confirm the implementation matches the required simplification direction exactly.

**Files**

- `nx/blocks/form-v3/**/*` (targeted cleanup only)
- `test/form-v3/core/*.test.js`
- `test/form/utils/document-resource.test.js` (only if touched by integration impact)

**Changes**

- Remove leftover terms/paths implying old architecture (`dispatch`, `subscribe`, `onChange`, stream forwarding).
- Keep core business logic in core (validation, mutation, persistence, compatibility, authorization).
- Keep UI as rendering + interaction + explicit rerender owner.
- Ensure final public architecture feels like:
  - SMALL STATEFUL ENGINE
  - THIN UI

**Verification**

- Targeted form-v3 tests pass.
- No boundary regressions (`core` remains headless, deterministic, reusable).
- Communication model is direct, explicit, predictable, and easy to debug.

**Confirmation prompt**

`Step 6 complete. Final acceptance gate passed. Confirm we close this plan and start execution?`

## Execution Constraints

- Do not combine multiple steps in one change.
- Do not reorder steps.
- If hidden coupling blocks a step, stop and request direction before proceeding.
- Ask for explicit confirmation before every next step.
