# Form V1 to V2 Migration Plan (Implementation First)

## Goal

Build `form-v2` in `nx/blocks/form-v2` without changing `nx/blocks/form` (v1), while porting all v1 features and following `nx/blocks/form-v2/architectural-design.md`.

## Scope and Constraints

- v1 remains untouched and fully functional.
- v2 is implemented in isolated files and custom elements.
- Inside `nx/blocks/form-v2`, do not use `-v2` suffixes in filenames or component symbols.
- Implementation is done step by step.
- Automated tests are deferred until after core implementation (by request).
- Any architectural deviation from `architectural-design.md` must be explicit and reviewed first.

## Step-by-Step Implementation Plan

### Step 1: V2 Skeleton and Isolation

Create the v2 module structure and entrypoint with unique custom element names (without `v2` suffix naming).

Target paths:
- `nx/blocks/form-v2/form.js`
- `nx/blocks/form-v2/views/`
- `nx/blocks/form-v2/schema/`
- `nx/blocks/form-v2/model/`
- `nx/blocks/form-v2/services/`
- `nx/blocks/form-v2/controllers/`
- `nx/blocks/form-v2/state/`
- `nx/blocks/form-v2/utils/`

Outcome:
- v2 can be loaded independently with no collision with v1 elements.
- Naming remains clean (no `-v2` suffixes) while v1 and v2 coexist.

### Step 2: Loader and Boundary Adapters

Implement loading orchestration and input boundary adapters for:
- resource/document loading
- schema loading
- permission/blocker handling
- HTML document to runtime input adapter

Target paths:
- `nx/blocks/form-v2/controllers/async-loader.controller.js`
- `nx/blocks/form-v2/services/persistence/json-api.js`
- `nx/blocks/form-v2/services/schema/schema-registry.js`
- `nx/blocks/form-v2/services/loader/document-loader.js`
- `nx/blocks/form-v2/services/loader/document-resource.js`
- `nx/blocks/form-v2/adapters/html2json.js` (or equivalent boundary module)

Outcome:
- v2 can initialize from existing document resources and return the same blocking states as v1.

### Step 3: Schema Compiler and Internal Form Model

Compile raw JSON Schema into a UI-safe internal form model and build runtime tree/indexes.

Target paths:
- `nx/blocks/form-v2/schema/schema-compiler.js`
- `nx/blocks/form-v2/schema/schema-resolver.js`
- `nx/blocks/form-v2/schema/schema-defaults.js`
- `nx/blocks/form-v2/model/form-model-builder.js`
- `nx/blocks/form-v2/model/form-model-index.js`
- `nx/blocks/form-v2/model/json-pointer.js`
- `nx/blocks/form-v2/utils/ids.js`

Outcome:
- UI consumes only internal model nodes (not raw schema internals).
- Arrays use stable internal ids plus JSON Pointer addressing.

### Step 4: Mutation, Validation, and Immediate Persistence Services

Implement pure services for:
- value mutation
- array add/insert/remove/reorder
- validation (schema + required empty handling)
- immediate persistence status flow

Target paths:
- `nx/blocks/form-v2/services/mutation/value-mutator.js`
- `nx/blocks/form-v2/services/mutation/array-mutator.js`
- `nx/blocks/form-v2/services/validation/validation-engine.js`
- `nx/blocks/form-v2/services/persistence/json-api.js`
- `nx/blocks/form-v2/state/form-store.js`
- `nx/blocks/form-v2/state/saving-store.js`

Outcome:
- every user change updates local state, validates, and persists immediately.

### Step 5: Controllers and Event Contracts

Wire one-way flow (`state down, events up`) and standardized intent events.

Target paths:
- `nx/blocks/form-v2/editor/form-editor-controller.js`
- `nx/blocks/form-v2/controllers/autosave.controller.js`
- `nx/blocks/form-v2/controllers/field-state.controller.js`
- `nx/blocks/form-v2/controllers/array.controller.js`

Event contracts:
- `form-field-change`
- `form-array-add`
- `form-array-insert`
- `form-array-remove`
- `form-array-reorder`
- `form-nav-pointer-select`

Outcome:
- components emit intent only; controllers orchestrate services and stores.

### Step 6: Editor UI (Fields + Containers)

Rebuild recursive editor rendering and array interaction UX.

Target paths:
- `nx/blocks/form-v2/components/fields/text-field.js`
- `nx/blocks/form-v2/components/fields/number-field.js`
- `nx/blocks/form-v2/components/fields/checkbox-field.js`
- `nx/blocks/form-v2/components/fields/select-field.js`
- `nx/blocks/form-v2/components/containers/object-group.js`
- `nx/blocks/form-v2/components/containers/array-field.js`
- `nx/blocks/form-v2/components/containers/field-section.js`
- `nx/blocks/form-v2/views/components/array-item-menu.js`
- `nx/blocks/form-v2/views/components/reorder-dialog.js`
- `nx/blocks/form-v2/views/editor.js`

Outcome:
- parity with v1 editing behavior for primitive fields and array operations.

### Step 7: Sidebar, Navigation Sync, and Preview

Port navigation and preview UX using v2 state/controller contracts.

Target paths:
- `nx/blocks/form-v2/views/sidebar.js`
- `nx/blocks/form-v2/views/preview.js`
- `nx/blocks/form-v2/components/save-status.js`
- `nx/blocks/form-v2/components/error-summary.js`

Outcome:
- editor and sidebar pointer selection stay synchronized.
- preview reflects current JSON state.

### Step 8: Feature Parity Completion and Migration Readiness

Finalize v2 parity against v1 behavior and prepare rollout wiring.

Target paths:
- `nx/blocks/form-v2/form.js`
- migration wiring files (where v2 is mounted/selected)

Outcome:
- v2 has full v1 feature parity under architecture constraints.
- v1 remains unchanged.

## Coverage Confirmation

### V1 Feature Coverage

- Document/resource detection and blocker states: Step 2
- Schema load + schema selection for empty docs: Steps 2 and 5
- Primitive field editing (string/number/boolean/enum): Step 6
- Array add/insert/remove/reorder: Steps 4 and 6
- Validation and required field errors: Step 4
- Immediate persistence after each change: Steps 4 and 5
- Sidebar navigation tree and active pointer sync: Step 7
- JSON preview rendering: Step 7
- Root orchestration and hash/resource lifecycle behavior: Steps 2, 5, and 8

### Architectural-Design Coverage

- Schema only at boundary: Steps 2 and 3
- Internal form model as UI contract: Step 3
- One-way data flow (state down/events up): Steps 5 and 6
- Services vs controllers separation: Steps 4 and 5
- Tree model + flat runtime indexes: Step 3
- JSON Pointer as canonical id: Steps 3, 4, and 5
- Immediate persistence model: Step 4
- Dumb components + container hierarchy: Steps 6 and 7
- One-direction dependency layering: Steps 1 and 8

## Deferred Work

- Automated tests are intentionally postponed until implementation parity is complete.
- After Step 8, add unit/component/integration tests for v2.
