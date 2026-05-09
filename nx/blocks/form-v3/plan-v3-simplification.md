# Form V3 Simplification Plan (Strict Execution)

## Source of Truth

This plan is derived strictly from:

- `nx/blocks/form-v3/architectural-simplification.md`

No redesign is introduced.  
The target remains:

- `app/` = boundary + bootstrapping
- `core/` = headless editor engine
- `ui-lit/` = thin reactive rendering + interaction

## Mandatory Step Protocol (No Exceptions)

Each step must be executed in isolation and in order:

1. Implement only the current step scope.
2. Run the listed verification for that step.
3. Report changed files and verification outcome.
4. Ask the step confirmation prompt exactly.
5. Wait for explicit confirmation before starting the next step.

## Non-Negotiable Architectural Guardrails

### NEVER

- move UI interaction state into core
- couple core to Lit or DOM
- let UI mutate canonical document state directly
- let UI call persistence directly
- rely on implicit selection to infer mutation targets
- silently degrade unsupported schema

### ALWAYS

- keep core headless and deterministic
- keep JSON Pointer (RFC 6901) canonical
- keep commands explicit
- keep persistence and validation in core
- keep UI interaction state local to `ui-lit`
- keep array stable IDs for rendering identity

## Step-by-Step Simplification Plan (Fixed Order)

### Step 1 - Simplify Persistence Flow (`6.1`)

**Goal**

Make persistence in core explicit and small, while preserving sequencing and error behavior.

**Files to change**

- `nx/blocks/form-v3/core/persistence/persistence-service.js`
- `nx/blocks/form-v3/core/form-core.js`
- `test/form-v3/core/form-core.test.js`

**Changes**

- Flatten persistence call flow so it is direct and easy to follow.
- Remove wrapper-style indirection if it only forwards data.
- Keep only the required behavior:
  - `persist(document)` behavior at core boundary
  - save sequencing
  - explicit success/failure results
- Keep persistence ownership fully inside core.

**Verification**

- Mutation commands still persist immediately after successful mutation.
- Save sequencing still prevents stale completion from overriding latest state.
- Persistence failures still surface explicit status/error in core state.

**Confirmation prompt**

`Step 1 complete. Proceed to Step 2 (simplify state management)?`

---

### Step 2 - Simplify State Management (`6.2`)

**Goal**

Reduce core state infrastructure to one explicit store + one subscription mechanism.

**Files to change**

- `nx/blocks/form-v3/core/state/state-store.js`
- `nx/blocks/form-v3/core/state/state-stream.js`
- `nx/blocks/form-v3/core/form-core.js`
- `test/form-v3/core/form-core.test.js`

**Changes**

- Replace split store/stream complexity with a single simple state primitive:
  - `getState()`
  - `setState()` (or equivalent single write API)
  - `subscribe()`
- Remove redundant state plumbing and duplicate snapshot mechanics.
- Keep core state serializable and deterministic.
- Preserve strict separation between core state and UI interaction state.

**Verification**

- `core.getState()` and `core.subscribe()` remain immutable snapshot-safe.
- Core state transitions remain deterministic under `load` + `dispatch`.
- No UI-local fields appear in core snapshots.

**Confirmation prompt**

`Step 2 complete. Proceed to Step 3 (simplify form-core orchestration)?`

---

### Step 3 - Simplify `form-core.js` Orchestration (`6.3`)

**Goal**

Keep one main core entry point, but flatten orchestration and command flow.

**Files to change**

- `nx/blocks/form-v3/core/form-core.js`
- `test/form-v3/core/form-core.test.js`

**Changes**

- Keep `form-core.js` as the single public core entry point.
- Reduce orchestration indirection by using explicit, readable flow stages:
  - load pipeline
  - command validation
  - mutation application
  - validation refresh
  - persistence trigger
- Keep command handling explicit and pointer-driven.
- Preserve existing public API (`load`, `dispatch`, `getState`, `subscribe`, `dispose`).

**Verification**

- Existing command behaviors still work (`field.change`, `array.add`, `array.insert`, `array.remove`, `array.move`).
- Unknown/invalid commands remain explicitly rejected.
- Core API remains unchanged and headless.

**Confirmation prompt**

`Step 3 complete. Proceed to Step 4 (simplify pointer handling)?`

---

### Step 4 - Simplify Pointer Handling (`6.4`)

**Goal**

Keep JSON Pointer canonical and remove weak/duplicative pointer abstractions.

**Files to change**

- `nx/blocks/form-v3/core/model/json-pointer.js`
- `nx/blocks/form-v3/core/model/definition-pointer.js`
- `nx/blocks/form-v3/core/form-core.js`
- `nx/blocks/form-v3/core/mutation/array-mutator.js`
- `test/form-v3/core/form-core.test.js`

**Changes**

- Re-evaluate the split between `json-pointer.js` and `definition-pointer.js`.
- If separation adds confusion, merge pointer lookup utilities into a clearer single pointer module (or tightly scoped minimal pair).
- Keep all addressing logic explicit and RFC 6901 aligned.
- Keep mutation and definition lookup code pointer-driven (no selection fallback).

**Verification**

- Pointer-based field and array mutations still resolve correct targets.
- Definition lookup for arrays/fields remains correct for nested structures.
- No command path depends on implicit UI selection.

**Confirmation prompt**

`Step 4 complete. Proceed to Step 5 (runtime model simplification)?`

---

### Step 5 - Simplify Runtime Model Logic Without Re-Engineering (`6.5`)

**Goal**

Keep runtime model stable and minimal; remove only unnecessary metadata/abstractions.

**Files to change**

- `nx/blocks/form-v3/core/model/runtime-model-builder.js`
- `nx/blocks/form-v3/core/model/runtime-model-index.js`
- `test/form-v3/core/form-core.test.js`

**Changes**

- Preserve required runtime responsibilities only:
  - stable IDs
  - pointer lookup
  - runtime values
  - schema-derived structure
- Avoid introducing new runtime abstraction layers.
- Remove obviously redundant runtime metadata only when proven unused.

**Verification**

- Stable IDs remain stable across non-structural updates.
- Pointer lookup remains correct and fast.
- Field rendering semantics (`sourceValue`, `defaultValue`, `effectiveValue`) remain intact.

**Confirmation prompt**

`Step 5 complete. Proceed to Step 6 (keep UI state local and simple)?`

---

### Step 6 - Keep UI State Local and Simple (`6.6`)

**Goal**

Ensure UI interaction state stays in `ui-lit`, remains explicit, and stays small.

**Files to change**

- `nx/blocks/form-v3/ui-lit/state/ui-state.js`
- `nx/blocks/form-v3/ui-lit/controllers/form-controller.js`
- `nx/blocks/form-v3/ui-lit/components/editor.js`
- `nx/blocks/form-v3/ui-lit/components/sidebar.js`
- `nx/blocks/form-v3/form-v3.js`
- `test/form-v3/core/form-controller.test.js`
- `test/form-v3/core/core-headless-boundary.test.js`

**Changes**

- Keep cross-component interaction state in UI store (navigation/selection context).
- Keep transient component-only interaction state local to components where possible.
- Remove unused/overly broad UI store fields if they are not actively used.
- Preserve `coreState + uiState` composition at controller/shell boundary.

**Verification**

- Sidebar/editor selection sync still works.
- UI interaction updates do not mutate core state directly.
- Core snapshots remain free of UI interaction fields.

**Confirmation prompt**

`Step 6 complete. Proceed to Step 7 (reduce boilerplate and thin abstractions)?`

---

### Step 7 - Reduce Boilerplate and Thin Indirection (`6.7`, `9`)

**Goal**

Aggressively remove trivial wrappers and merge files where separation adds little value.

**Files to change**

- `nx/blocks/form-v3/ui-lit/bindings/index.js`
- `nx/blocks/form-v3/ui-lit/bindings/state-binding.js`
- `nx/blocks/form-v3/app/bootstrap.js`
- `nx/blocks/form-v3/core/**/*` (only for clearly trivial pass-throughs)
- `test/form-v3/core/*.test.js` (as needed)

**Changes**

- Remove one-method pass-through modules when they only forward calls.
- Merge tightly coupled tiny modules where clarity improves.
- Keep separate files only when responsibilities are clearly distinct, reusable, or independently testable.
- Preserve architecture boundaries while reducing file/count/indirection overhead.

**Verification**

- Public behavior remains unchanged under existing tests.
- File graph is flatter and easier to trace for load/dispatch/render flow.
- No boundary violations introduced (`app` vs `core` vs `ui-lit`).

**Confirmation prompt**

`Step 7 complete. Proceed to Step 8 (final acceptance gate)?`

---

### Step 8 - Final Simplification Acceptance Gate (`10`, `11`, `12`, `13`)

**Goal**

Validate that simplification is complete and aligned with required architecture.

**Files to change**

- `nx/blocks/form-v3/plan-v3-simplification.md` (checklist updates only, optional)
- `test/form-v3/core/*.test.js` (only if acceptance gaps appear)

**Changes**

- Run final gate checks against required end state:
  - small headless core
  - small reactive UI
  - explicit command/state flow
  - local UI interaction state
  - immediate persistence in core
  - explicit unsupported schema behavior
- Record any residual gaps before declaring completion.

**Verification**

- Core remains headless and reusable outside Lit/DOM.
- UI remains thin (render + interaction + command dispatch).
- Simplified flow is readable, predictable, and easier to debug.

**Confirmation prompt**

`Step 8 complete. Final simplification gate passed. Confirm closing this plan?`

## Execution Notes

- Do not batch multiple steps in one change.
- Do not reorder steps.
- If a step reveals hidden coupling, stop and request direction before changing step order/scope.
- Every step ends with an explicit user confirmation request before proceeding.
