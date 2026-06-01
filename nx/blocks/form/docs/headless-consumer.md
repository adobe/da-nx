# Headless consumer example

How a non-browser process — CLI script, MCP server, AI agent — drives the form's `core/`. Same code path the editor uses; no DOM involved.

```js
import { createCore, validateAgainst } from '../core/index.js';

// Schema must follow ./schema-spec.md — every node declares `type` and `title`,
// no composition keywords, only the constraints listed in the spec.
const schema = {
  type: 'object',
  title: 'Project',
  required: ['name'],
  properties: {
    name:   { type: 'string', title: 'Name' },
    status: { type: 'string', title: 'Status', enum: ['Draft', 'Active'] },
    tags:   { type: 'array',  title: 'Tags', items: { type: 'string', title: 'Tag' } },
  },
};

const saveDocument = async ({ path, document }) => {
  console.log('save', path, JSON.stringify(document));
  return { ok: true };
};

// `core` is referenced inside onChange via closure — declared below. This works
// because onChange runs only after createCore() returns. Do not reorder.
let core;
const onChange = () => {
  const state = core.getState();
  const errors = Object.keys(state.validation.errorsByPointer);
  const issues = state.schemaIssues.length;
  console.log(`status=${state.saveStatus} errors=${errors.length} issues=${issues}`);
};

core = createCore({ path: '/projects/demo', saveDocument, onChange });

await core.load({ schema, document: { metadata: {}, data: {} } });
// → status=idle errors=1 issues=0           (name is required, document is empty)

core.setField('/data/name', 'Alice');             // satisfies `required`
// → status=saving errors=0 issues=0
// → save /projects/demo {"metadata":{},"data":{"name":"Alice"}}
// → status=saved  errors=0 issues=0

core.setField('/data/status', 'Active');          // satisfies `enum`
core.addItem('/data/tags');                       // append an array slot
core.setField('/data/tags/0', 'demo');            // fill the slot

console.log(JSON.stringify(core.getState().document.values, null, 2));
// → {"metadata":{},"data":{"name":"Alice","status":"Active","tags":["demo"]}}
```

`saveDocument` is fire-and-forget from the mutation's perspective — `setField` returns synchronously and the save settles via `onChange`. To wait deterministically, observe `state.saveStatus === 'saved'` in the callback.

## Reacting to errors

Errors are data on `state.validation.errorsByPointer`. An agent can react programmatically without parsing UI:

```js
core.setField('/data/status', 'Unknown');         // not in the enum
const errors = core.getState().validation.errorsByPointer;
// → { '/data/status': 'Must be one of the allowed options.' }
```

The same data is available *without* a session via `validateAgainst`:

```js
const result = validateAgainst(schema, { name: '', status: 'Unknown' });
// → result.errorsByPointer = {
//     '/data/name':   'This field is required.',
//     '/data/status': 'Must be one of the allowed options.',
//   }
```

## Three things to remember

- **Mutations are pointer-based.** Every change is identified by an RFC 6901 pointer (`/data/tags/0`). This maps directly to MCP tool parameters or agent action descriptions — no opaque handles, no field IDs.
- **Errors are data, not events.** `state.validation.errorsByPointer` is a flat `{ pointer: message }` object. An agent can react programmatically to "field X is invalid" without parsing messages or scraping UI.
- **Schema issues are structured.** `state.schemaIssues` is an array of `{ pointer, reason, feature, details }` where `reason` is one of `unsupported-composition` / `unsupported-type` / `type-as-array` / `missing-type` / `external-ref` / `unresolved-ref`. An agent that built the schema can use the reason code to decide how to fix it on the next attempt.

## What schemas to write

The form accepts a strict subset of JSON Schema 2020-12. The full contract is in [schema-spec.md](./schema-spec.md). Anything outside that contract surfaces in `state.schemaIssues` and is not rendered.
