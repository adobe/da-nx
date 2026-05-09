# Form V3 Architectural Correction Plan (Strict Execution)

## Source of Truth

This plan is derived strictly from:

- `nx/blocks/form-v3/architectural-correction-plan.md`

No architectural scope is added beyond that document.  
All changes are applied only to `nx/blocks/form-v3` (plus supporting tests in `test/form-v3`).

## Mandatory Step Protocol

For this execution, every step is isolated and must follow this exact protocol:

1. Implement only the current step.
2. Run the step-specific verification checks.
3. Report files changed and acceptance evidence.
4. Ask for confirmation using the step's confirmation prompt.
5. Wait for explicit confirmation before starting the next step.

## Non-Negotiable Architecture Rules

### NEVER

- store UI interaction state in the core
- let the core depend on DOM or rendering
- let the UI mutate document state directly
- let UI components call persistence directly
- let unsupported schemas silently degrade
- allow stale save responses to overwrite newer state
- make commands depend on implicit selection state

### ALWAYS

- keep the core headless
- keep UI state local to the UI layer
- use explicit pointer-based commands
- keep persistence inside the core
- keep validation inside the core
- use JSON Pointer as canonical addressing
- preserve stable IDs for arrays
- keep the UI replaceable
- keep state transitions deterministic

## Step-by-Step Implementation Plan

### Step 1 - Remove Selection State from Core (Section 6.1, Highest Priority #1)

**Goal**

Remove `selection` ownership from the core state and command handling.

**Files to change**

- `nx/blocks/form-v3/core/state/state-store.js`
- `nx/blocks/form-v3/core/form-core.js`
- `test/form-v3/core/form-core.test.js`

**Changes**

- Remove `selection` from `createInitialState()`.
- Remove selection initialization during `core.load()`.
- Remove `selection.change` handling from core dispatch.
- Ensure core command handling no longer references focused/active UI state.
- Update tests that currently expect `state.selection`.

**Verification**

- Core snapshots contain no `selection` object.
- `core.dispatch({ type: 'selection.change', ... })` is rejected/ignored as non-core behavior.
- Existing core load/mutation tests remain green after expected assertion updates.

**Confirmation prompt**

`Step 1 complete. Proceed to Step 2 (introduce UI-only interaction state)?`

### Step 2 - Introduce Dedicated UI State Layer (Section 6.2, Highest Priority #2)

**Goal**

Create a UI-local state store for interaction concerns and move active pointer/focus/navigation state there.

**Files to change**

- `nx/blocks/form-v3/ui-lit/state/ui-state.js` (new)
- `nx/blocks/form-v3/ui-lit/controllers/form-controller.js`
- `nx/blocks/form-v3/ui-lit/controllers/intent-command-map.js`
- `nx/blocks/form-v3/form-v3.js`
- `nx/blocks/form-v3/ui-lit/components/editor.js`
- `nx/blocks/form-v3/ui-lit/components/sidebar.js`

**Changes**

- Add a UI state module with at least:
  - `activePointer`
  - `selectionOrigin`
  - `selectionSequence`
  - room for focus/expanded/scroll/reorder dialog state
- Keep this store fully outside core state.
- Route selection/navigation intents to UI state updates (not core dispatch).
- Build view context from `coreState + uiState` composition in shell/controller.

**Verification**

- Selection, focus, and sidebar/editor sync still work.
- Core state remains unchanged when UI-only interactions occur.
- UI state can reset/reinitialize independently of core document state.

**Confirmation prompt**

`Step 2 complete. Proceed to Step 3 (enforce explicit pointer-based commands)?`

### Step 3 - Keep Commands Explicit and Pointer-Based (Section 5, Highest Priority #3)

**Goal**

Guarantee core mutations only run with explicit command payloads and pointers.

**Files to change**

- `nx/blocks/form-v3/core/form-core.js`
- `nx/blocks/form-v3/ui-lit/controllers/intent-command-map.js`
- `test/form-v3/core/form-core.test.js`

**Changes**

- Harden command validation for `field.change`, `array.add`, `array.insert`, `array.remove`, `array.move`.
- Reject commands missing required pointer fields.
- Remove any fallback behavior that infers target from previous selection.
- Keep command payload intent explicit end-to-end.

**Verification**

- Missing-pointer mutation commands are rejected with explicit command result reason.
- Valid pointer-based commands continue to mutate and persist correctly.
- No core mutation path depends on UI-local selection.

**Confirmation prompt**

`Step 3 complete. Proceed to Step 4 (headless core enforcement)?`

### Step 4 - Keep Core Fully Headless (Section 6.3, Highest Priority #4)

**Goal**

Confirm and enforce that the core runs without Lit, DOM, focus, or scroll dependencies.

**Files to change**

- `nx/blocks/form-v3/core/form-core.js` (if needed)
- `nx/blocks/form-v3/core/**/*` (only if violations are found)
- `test/form-v3/core/form-core.test.js`

**Changes**

- Remove any accidental DOM/rendering references from core modules.
- Keep core imports limited to core-layer modules.
- Add/adjust tests that execute core in a pure test environment.

**Verification**

- Core tests run with no DOM-dependent setup.
- No `window`, `document`, Lit, or component imports in core modules.
- Core behavior remains deterministic under test-only execution.

**Confirmation prompt**

`Step 4 complete. Proceed to Step 5 (split core state into explicit slices)?`

### Step 5 - Split Core State into Explicit Slices (Section 6.5, Medium Priority #5)

**Goal**

Refactor coarse state into explicit canonical slices, while keeping UI state out.

**Files to change**

- `nx/blocks/form-v3/core/state/state-store.js`
- `nx/blocks/form-v3/core/form-core.js`
- `nx/blocks/form-v3/form-v3.js`
- `nx/blocks/form-v3/ui-lit/bindings/state-binding.js` (if needed)
- `test/form-v3/core/form-core.test.js`

**Changes**

- Introduce explicit conceptual slices:
  - `document`
  - `model`
  - `validation`
  - `loading`
  - `saving`
  - `permissions`
  - `compatibility`
  - `errors`
- Update state writes and reads to use slice boundaries.
- Keep snapshots serializable and deterministic.

**Verification**

- State shape is slice-based and easier to reason about.
- No UI interaction fields appear in any core slice.
- UI rendering still receives required canonical data from adapted state mapping.

**Confirmation prompt**

`Step 5 complete. Proceed to Step 6 (explicit unsupported schema behavior)?`

### Step 6 - Make Unsupported Schema Behavior Explicit (Section 6.6)

**Goal**

Prevent silent schema degradation and surface explicit compatibility failures.

**Files to change**

- `nx/blocks/form-v3/core/schema/schema-compiler.js`
- `nx/blocks/form-v3/core/form-core.js`
- `nx/blocks/form-v3/ui-lit/components/editor.js` (unsupported rendering text only if needed)
- `test/form-v3/core/form-core.test.js`

**Changes**

- Replace permissive unknown-shape fallback behavior with explicit unsupported signaling.
- Ensure unsupported constructs produce compatibility blockers/status.
- Keep unsupported behavior visible to UI as clear limitations.

**Verification**

- Unknown/unsupported schema constructs do not silently compile as valid primitives.
- Compatibility state and blockers are explicit and stable.
- Existing unsupported-schema tests pass, with added coverage for unknown shapes.

**Confirmation prompt**

`Step 6 complete. Proceed to Step 7 (isolate save sequencing)?`

### Step 7 - Isolate Save Sequencing Logic (Section 6.8, Medium Priority #6)

**Goal**

Extract save sequencing into a clearer isolated unit while preserving behavior.

**Files to change**

- `nx/blocks/form-v3/core/form-core.js`
- `nx/blocks/form-v3/core/persistence/save-sequencing.js` (new, if extraction is done)
- `test/form-v3/core/form-core.test.js`

**Changes**

- Isolate sequencing flow (`latestRequested`, `latestAcknowledged`, stale response checks).
- Keep stale-save protection rule unchanged and explicit.
- Keep persistence ownership in core.

**Verification**

- Existing stale save test remains green.
- Additional tests cover sequence bookkeeping and failed-save interactions.
- Older responses never overwrite newer edits.

**Confirmation prompt**

`Step 7 complete. Proceed to Step 8 (reduce concentration in form-core.js)?`

### Step 8 - Reduce Responsibility Concentration in `form-core.js` (Section 6.4, Medium Priority #7)

**Goal**

Keep `form-core.js` as public entry point while isolating internal pipelines.

**Files to change**

- `nx/blocks/form-v3/core/form-core.js`
- `nx/blocks/form-v3/core/*` (new internal modules for loading/validation/mutation orchestration as needed)
- `test/form-v3/core/form-core.test.js`

**Changes**

- Extract internal responsibilities into clearer units:
  - loading pipeline
  - validation pipeline
  - mutation coordination
  - compatibility transitions
  - state transitions
- Maintain current public core API unchanged.

**Verification**

- Public API remains: `load`, `dispatch`, `getState`, `subscribe`, `dispose`.
- Behavior remains equivalent under existing tests.
- `form-core.js` becomes thinner and less centralized.

**Confirmation prompt**

`Step 8 complete. Proceed to Step 9 (runtime value semantics clarification)?`

### Step 9 - Clarify Runtime Value Semantics (Section 6.7, Medium Priority #8)

**Goal**

Preserve and document `sourceValue`, `defaultValue`, and `effectiveValue` semantics.

**Files to change**

- `nx/blocks/form-v3/core/model/runtime-model-builder.js`
- `nx/blocks/form-v3/architectural-design-form-v3.md` (only if runtime semantics doc patch is required)
- `test/form-v3/core/form-core.test.js` (and/or dedicated runtime model test file)

**Changes**

- Make runtime value semantics explicit in implementation comments and tests.
- Ensure primitive runtime nodes expose consistent value semantics.
- Guard behavior for empty values, defaults, and array item instantiation.

**Verification**

- Tests assert the distinction between source/default/effective values.
- No regressions in field rendering behavior that depends on these values.

**Confirmation prompt**

`Step 9 complete. Proceed to Step 10 (keep app/form-v3.js thin)?`

### Step 10 - Keep `app/form-v3.js` Thin (Section 6.9)

**Goal**

Ensure shell remains bootstrap/app entry only, not business orchestration.

**Files to change**

- `nx/blocks/form-v3/form-v3.js`
- `nx/blocks/form-v3/app/bootstrap.js`
- `nx/blocks/form-v3/ui-lit/controllers/form-controller.js`

**Changes**

- Keep shell focused on context loading, app bootstrapping, and rendering composition.
- Move any emerging state-manager/orchestrator logic out of shell.
- Keep validation/persistence/command orchestration in core.

**Verification**

- Shell has no core business logic branches beyond view mapping and lifecycle wiring.
- All mutations still flow through controller -> core dispatch.

**Confirmation prompt**

`Step 10 complete. Proceed to Step 11 (keep UI controllers thin)?`

### Step 11 - Keep UI Controllers Thin (Section 6.10)

**Goal**

Limit controllers to UI adapter responsibilities only.

**Files to change**

- `nx/blocks/form-v3/ui-lit/controllers/form-controller.js`
- `nx/blocks/form-v3/ui-lit/controllers/intent-command-map.js`

**Changes**

- Keep controllers as:
  - command forwarders
  - ui-state updaters
  - state subscribers
- Prevent controllers from taking ownership of validation/persistence/schema interpretation/document state.

**Verification**

- Controllers contain no validation engine logic.
- Controllers contain no persistence logic.
- Controllers contain no schema compilation or canonical state ownership logic.

**Confirmation prompt**

`Step 11 complete. Proceed to Step 12 (lower-priority structural improvements)?`

### Step 12 - Lower Priority Structural Improvements (Section 9, Lower Priority #9-#11)

**Goal**

Apply lower-priority refinements after all required/medium corrections are stable.

**Files to change**

- `nx/blocks/form-v3/core/**/*` (as needed)
- `test/form-v3/core/form-core.test.js` (plus any additional targeted tests)

**Changes**

- Optimize state cloning where profiling justifies it.
- Introduce reducer-style command handling if it improves determinism/readability.
- Continue internal modularization of orchestration.

**Verification**

- No architectural boundary regressions.
- No state determinism regressions.
- Performance/readability gains are measurable or clearly justified.

**Confirmation prompt**

`Step 12 complete. Proceed to final architecture acceptance gate?`

## Final Acceptance Gate (Before Declaring Correction Complete)

All must be true:

- core is UI-independent and headless
- UI interaction state is fully UI-local
- commands are explicit and pointer-based
- persistence and validation stay in core
- unsupported schemas fail explicitly
- stale save responses never overwrite newer edits
- shell and controllers remain thin
- state transitions remain deterministic and serializable

When all are true, the architecture matches the correction plan direction:

`HEADLESS CORE + THIN REACTIVE UI`
