Lit JSON Schema Form Editor — Architecture Guidelines

1. Overview

This document describes the architecture for a JSON Schema-driven form editor implemented using:

- Lit components
- Vanilla JavaScript (ES modules)
- JSON Schema
- RFC 6901 JSON Pointer

The goal is to provide a maintainable, testable, extensible, and simple architecture that supports:

- rendering forms from JSON Schema
- editing existing JSON documents
- immediate persistence on field changes
- isolated components
- predictable state management
- reusable services
- recursive object/array editing

This document is intended to guide implementation by coding agents and developers.

⸻

2. Architectural Principles

2.1 Schema as Input Boundary

JSON Schema is only used at the application boundary.

The editor UI must not directly depend on raw JSON Schema.

Instead:

JSON Schema
↓
Schema Compiler
↓
Internal Form Model
↓
UI Components

This prevents schema-specific complexity from leaking into UI code.

⸻

2.2 Form Model as Internal Contract

The application operates primarily on an internal form model.

The form model is:

- UI-oriented
- normalized
- schema-independent
- recursive
- stable

Lower-level components should only understand the form model.

They should not understand:

- $ref
- allOf
- oneOf
- raw schema keywords
- schema composition semantics

⸻

2.3 State Down, Events Up

The application uses one-way data flow.

Components receive:

- values
- field metadata
- validation state

Components emit:

- intent events

Example:

{
type: "form-field-change",
pointer: "/contacts/0/name",
value: "Alice"
}

Components never mutate global state directly.

⸻

2.4 Services vs Controllers

Services

Services contain reusable business logic.

Characteristics:

- framework-independent
- pure or mostly pure
- testable without DOM
- reusable

Examples:

- schema compiler
- validation
- mutation
- persistence

⸻

Controllers

Controllers coordinate UI behavior.

Characteristics:

- Lit-aware
- manage reactive state
- handle events
- call services
- orchestrate workflows

Examples:

- editor controller
- autosave controller
- loader controller

⸻

2.5 Tree Model + Flat Runtime Indexes

The form definition is hierarchical.

The runtime state is indexed.

Tree structure

Used for:

- rendering
- recursive traversal
- layout
- hierarchy

Flat indexes

Used for:

- fast lookup
- updates
- validation
- subscriptions

⸻

2.6 JSON Pointer as Canonical Identifier

RFC 6901 JSON Pointer is the canonical field identifier.

Examples:

/contacts/0/name
/settings/theme

Used for:

- field identity
- events
- state lookup
- validation
- persistence
- mutations

⸻

3. High-Level Architecture

JSON Schema
↓
Schema Compiler
↓
Form Model Definition
↓
Form Model Builder
↓
Runtime Form Tree
↓
Lit Components
↓
Events
↓
Controllers
↓
Mutation Services
↓
Updated JSON
↓
Persistence Service

⸻

4. Application Lifecycle

4.1 Initialization Flow

app-shell
↓
async-loader.controller
↓
load schema
load json document
load permissions
↓
validate permissions
validate schema support
validate json structure
↓
compile schema
↓
build runtime form model
↓
initialize editor

⸻

5. Form Model Design

5.1 Purpose

The form model represents the UI-ready interpretation of the schema.

It contains:

- field structure
- rendering metadata
- normalized validation rules
- hierarchy
- default values
- UI hints

It does NOT expose raw schema internals to UI components.

⸻

5.2 Form Model Shape

Example:

{
kind: "string",
pointer: "/contacts/0/name",
label: "Name",
required: true,
readonly: false,
defaultValue: "",
validation: {
minLength: 1
},
ui: {
widget: "text"
}
}

⸻

5.3 Object Nodes

Example:

{
kind: "object",
pointer: "/contacts/0",
children: [...]
}

⸻

5.4 Array Nodes

Example:

{
kind: "array",
pointer: "/contacts",
item: {...},
minItems: 0,
maxItems: 10
}

⸻

6. Existing JSON Data

The editor is initialized using:

schema + existing json

The schema defines:

- structure
- rules
- constraints

The JSON defines:

- current values
- array lengths
- instantiated objects

Example:

{
"contacts": [
{ "name": "Alice" },
{ "name": "Bob" }
]
}

The runtime model must create two array item instances.

⸻

7. Runtime State

Runtime state is separate from the form definition.

Runtime state includes:

- current JSON values
- validation errors
- saving state
- selection state

⸻

Example flat indexes

values.get("/contacts/0/name")
errors.get("/contacts/0/name")
nodes.get("/contacts/0/name")

⸻

8. Arrays

Arrays are a major architectural concern.

Array responsibilities:

- add item
- remove item
- reorder item
- preserve stable IDs
- instantiate item defaults

⸻

Important Rule

JSON Pointer is positional.

Example:

/contacts/0
/contacts/1

Pointers change when items move.

Therefore:

- use JSON Pointer for addressing
- use stable internal IDs for rendering

Example:

{
id: "uuid-123",
pointer: "/contacts/0"
}

⸻

9. Persistence Model

Persistence is immediate.

The application does NOT use draft state.

Save flow

field change
↓
update local state
↓
validate
↓
persist immediately
↓
update save status

⸻

Saving state

The application still tracks:

- saving
- saved
- failed

This is UI state, not draft state.

⸻

10. Validation

Validation is handled by the validation engine.

Responsibilities:

- schema validation
- field validation
- object validation
- array validation
- cross-field validation

Validation errors are normalized.

Example:

{
pointer: "/contacts/0/name",
message: "Required"
}

⸻

11. Permissions

Permission checks happen before editor initialization.

The editor itself should assume:

- editable document
- valid permissions
- supported schema

Permission logic belongs to:

- API layer
- authorization services
- loader orchestration

Not field components.

⸻

12. Component Architecture

12.1 Dumb Components

Field components are mostly dumb.

Responsibilities:

- render value
- emit events
- render validation state

They should not:

- mutate global state
- understand schema semantics
- call APIs

⸻

12.2 Container Components

Container components render hierarchy.

Examples:

- object groups
- arrays
- sections

Responsibilities:

- recursive rendering
- layout
- child coordination

⸻

13. Event Model

Events communicate intent upward.

Examples:

{
type: "form-field-change",
pointer: "/contacts/0/name",
value: "Alice"
}
{
type: "form-array-add",
pointer: "/contacts"
}
{
type: "form-array-remove",
pointer: "/contacts/1"
}

Components never directly mutate application state.

⸻

14. Recommended Project Structure

src/
app/
app-shell.js
editor/
form-editor-page.js
form-editor-controller.js
schema/
schema-compiler.js
schema-resolver.js
schema-defaults.js
model/
form-model-builder.js
form-model-index.js
json-pointer.js
services/
validation/
validation-engine.js
mutation/
value-mutator.js
array-mutator.js
persistence/
json-api.js
registry/
field-registry.js
widget-resolver.js
authorization/
authorization-service.js
controllers/
async-loader.controller.js
autosave.controller.js
field-state.controller.js
array.controller.js
components/
fields/
text-field.js
number-field.js
checkbox-field.js
select-field.js
containers/
object-group.js
array-field.js
field-section.js
form-toolbar.js
save-status.js
error-summary.js
state/
form-store.js
selection-store.js
saving-store.js
utils/
clone.js
paths.js
ids.js
guards.js
styles/
tokens.css
theme.css

⸻

15. Dependency Direction

Dependencies should flow in one direction only:

schema
↓
model
↓
services
↓
controllers
↓
components

Lower-level layers must not depend on higher-level layers.

⸻

16. Architectural Constraints

Components MUST NOT:

- mutate global state directly
- call persistence APIs directly
- understand raw schema internals
- contain validation business logic

⸻

Services MUST NOT:

- depend on Lit
- manipulate DOM
- contain UI logic

⸻

Controllers SHOULD:

- orchestrate workflows
- coordinate state updates
- handle events
- delegate business logic to services

⸻

17. Recommended Testing Strategy

Pure Unit Tests

Test:

- schema compiler
- validation engine
- mutation services
- JSON pointer utilities

⸻

Component Tests

Test:

- field rendering
- event emission
- validation display
- array rendering

⸻

Integration Tests

Test:

- schema loading
- editor initialization
- field editing
- persistence flow
- validation flow

⸻

18. Core Architectural Goals

The architecture optimizes for:

- simplicity
- isolation
- maintainability
- testability
- recursive rendering
- predictable state flow
- schema abstraction
- extensibility
- stable component contracts

The system should remain:

- schema-driven
- UI-independent internally
- highly modular
- easy to reason about
- easy to evolve incrementally
