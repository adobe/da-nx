# Form — Model builder

How `buildModel` turns a compiled schema + a document into the structure the renderer and validator walk.

---

## 1. What the model is for

The form has two raw inputs: a JSON Schema (authored) and a document (loaded from disk). Neither is convenient to render:

- The schema is a recursive nest of constructs (`type`, `properties`, `items`, `$ref`, composition keywords). The renderer doesn't want to interpret it on every keystroke.
- The document is a plain JSON tree. It carries values but no labels, no validation rules, no kind information.

The **model** is the merge of the two: a renderable tree where every node carries both schema-derived metadata (kind, label, validation rules) *and* the current value from the document, addressed by a stable JSON Pointer.

```
schema  ── compileSchema ──▶  definition  ─┐
                                            ├──▶  buildModel  ──▶  model
document ── parseDocument ── coerceData ───┘
```

Everything downstream — the editor, the sidebar, validation, DOM-to-data lookups — reads the model. The model is rebuilt on every mutation (it's cheap on small documents) so it is always consistent with the document it was built from.

---

## 2. Public surface

`buildModel({ definition, document })` from [core/model.js](../core/model.js).

| Input | Type | Source |
|---|---|---|
| `definition` | compiled definition tree | `compileSchema(rawSchema).definition` |
| `document` | `{ metadata, data }` | parsed + coerced JSON, owned by the model after the call |

Returns:

```js
{
  root,        // the tree — always a single object/array/primitive node rooted at '/data'
  byPointer,   // Map<pointer, node> — O(1) lookup by JSON Pointer
  document,    // the normalized document (kept for reference; do not mutate)
}
```

Plus `nodeAt({ model, pointer })` — sugar over `model.byPointer.get(pointer)`.

The contract: `buildModel` is a pure function of `(definition, document)`. No previous-model threading, no hidden state. Calling it twice with the same inputs produces structurally identical output.

---

## 3. Node shape

Every node carries the same base fields, plus kind-specific extras.

```js
{
  key,                     // schema property key ("name", "tags", "0", ...) or "data" at the root
  kind,                    // 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'unsupported'
  pointer,                 // RFC 6901, prefixed with '/data' (e.g. '/data/people/0/name')
  label,                   // schema.title or key fallback
  required,
  readonly,
  defaultValue,            // schema default, if any
  validation,              // picked subset of validation keywords (see below)
  value,                   // current value from the document for this pointer

  // object:
  children:    [...],
  unsupportedComposition?: { compositionKeyword, variants, schemaPath },

  // array:
  items:       [...],      // one node per document element
  minItems, maxItems,
  itemLabel,

  // primitive with enum:
  enumValues:  [...],      // when present, the editor renders a <select>

  // unsupported:
  unsupported: { reason, feature, compositionKeyword, variants, schemaPath },
}
```

The `validation` object is a stable, picked subset of the schema's validation keywords:

- string: `minLength`, `maxLength`, `pattern`
- number / integer: `minimum`, `maximum`

`validation.js` reads only these fields — additional schema keywords are ignored by design (the contract is [schema-spec.md](./schema-spec.md), not full JSON Schema).

---

## 4. Worked examples

Each example shows the input schema, the input document, and the resulting model. Long, repetitive fields are elided with `…`.

### 4.1. A flat object

```js
// schema
{
  type: 'object',
  title: 'Profile',
  properties: {
    name:    { type: 'string', title: 'Name', minLength: 1 },
    age:     { type: 'integer', minimum: 0 },
    enabled: { type: 'boolean', default: true },
  },
  required: ['name'],
}

// document
{ metadata: { schemaName: 'profile' }, data: { name: 'Alice', age: 30, enabled: false } }
```

```js
// model.root
{
  key: 'data',
  kind: 'object',
  pointer: '/data',
  label: 'Profile',
  required: false,
  readonly: false,
  defaultValue: undefined,
  validation: {},
  value: { name: 'Alice', age: 30, enabled: false },
  children: [
    {
      key: 'name',
      kind: 'string',
      pointer: '/data/name',
      label: 'Name',
      required: true,
      readonly: false,
      validation: { minLength: 1 },
      value: 'Alice',
    },
    {
      key: 'age',
      kind: 'integer',
      pointer: '/data/age',
      label: 'age',
      required: false,
      readonly: false,
      validation: { minimum: 0 },
      value: 30,
    },
    {
      key: 'enabled',
      kind: 'boolean',
      pointer: '/data/enabled',
      label: 'enabled',
      required: false,
      readonly: false,
      defaultValue: true,
      value: false,
    },
  ],
}

// model.byPointer (Map)
'/data'         → root
'/data/name'    → children[0]
'/data/age'     → children[1]
'/data/enabled' → children[2]
```

### 4.2. Array of primitives

```js
// schema
{
  type: 'object',
  properties: {
    tags: { type: 'array', items: { type: 'string' }, minItems: 1 },
  },
}

// document
{ metadata: {…}, data: { tags: ['red', 'blue'] } }
```

```js
// model.root.children[0]
{
  key: 'tags',
  kind: 'array',
  pointer: '/data/tags',
  label: 'tags',
  minItems: 1,
  maxItems: undefined,
  itemLabel: '',
  value: ['red', 'blue'],
  items: [
    { key: 'item', kind: 'string', pointer: '/data/tags/0', value: 'red',  … },
    { key: 'item', kind: 'string', pointer: '/data/tags/1', value: 'blue', … },
  ],
}
```

The pointer for each item embeds its current index. If the user reorders, pointers shift — there is no separate stable id.

### 4.3. Array of objects

```js
// schema
{
  type: 'object',
  properties: {
    people: {
      type: 'array',
      items: {
        type: 'object',
        title: 'Person',
        properties: {
          name:   { type: 'string' },
          active: { type: 'boolean' },
        },
      },
    },
  },
}

// document
{ metadata: {…}, data: { people: [{ name: 'Bob', active: true }] } }
```

```js
// model.root.children[0]
{
  key: 'people', kind: 'array', pointer: '/data/people',
  itemLabel: 'Person',
  items: [
    {
      key: 'item', kind: 'object', pointer: '/data/people/0',
      label: 'Person',
      value: { name: 'Bob', active: true },
      children: [
        { key: 'name',   kind: 'string',  pointer: '/data/people/0/name',   value: 'Bob' },
        { key: 'active', kind: 'boolean', pointer: '/data/people/0/active', value: true  },
      ],
    },
  ],
}
```

`byPointer` lists every node, including the array, each item, and each item's children — five entries for this example.

### 4.4. Enum (renders as `<select>`)

```js
// schema
{ type: 'object', properties: { color: { type: 'string', enum: ['red', 'blue'] } } }

// document
{ data: { color: 'red' } }
```

```js
// model.root.children[0]
{
  key: 'color', kind: 'string', pointer: '/data/color',
  enumValues: ['red', 'blue'],
  value: 'red',
}
```

`enumValues` is the trigger — `editor.js` sees it and renders a `<select>` instead of a text input.

### 4.5. Unsupported subtree

```js
// schema
{
  type: 'object',
  properties: {
    weird: { oneOf: [{ type: 'string' }, { type: 'number' }] },
  },
}
```

```js
// model.root.children[0]
{
  key: 'weird',
  kind: 'unsupported',
  pointer: '/data/weird',
  readonly: true,
  unsupported: {
    compositionKeyword: 'oneOf',
    feature: 'oneOf',
    reason: 'unsupported-composition',
    variants: 2,
    schemaPath: '/',
    details: null,
  },
}
```

The editor skips rendering this node; the saved value passes through unchanged. The compiler also pushes an entry into `schemaIssues` so the schema-issues panel can surface it. See [architecture.md §10](./architecture.md) for the full unsupported-feature policy.

### 4.6. Pointer escaping

JSON Pointer escapes `/` as `~1` and `~` as `~0`.

```js
// schema
{ type: 'object', properties: { 'a/b': { type: 'string' }, 'c~d': { type: 'string' } } }

// document
{ data: { 'a/b': 'x', 'c~d': 'y' } }
```

```js
// pointers in the model
'/data'
'/data/a~1b'   // 'a/b'
'/data/c~0d'   // 'c~d'
```

Use `appendPointer`, `unescapePointerSegment`, and friends from [core/pointer.js](../core/pointer.js) — never concatenate raw segments.

---

## 5. How consumers use the model

| Consumer | Read pattern |
|---|---|
| `editor.js` — field rendering | Recursive walk over `root` → `children` → `items`. Each node carries everything the renderer needs (`kind`, `label`, `enumValues`, `validation`, `value`). DOM elements carry `data-pointer="…"` for round-trip identification. |
| `sidebar.js` — navigation | Recursive walk; only renders nodes where `kind === 'object'` or `kind === 'array'`. Selecting a node emits its `pointer`. |
| `validation.js` | `traverse(root)` visits every node and reports errors keyed by `pointer`. The set is exposed as `state.validation.errorsByPointer`. |
| DOM ↔ data | `byPointer.get(pointer)` for `O(1)` lookup. Used by scroll-into-view, error highlighting, and any UI that needs to jump from a click target back to its node. |
| `mutate.js` | Mutations operate on the document by pointer (`applySet`, `applyAdd`, etc.). After the mutation, `buildModel` runs again — the new model reflects the new document. |

The model is read-only from a consumer's perspective. Mutations always go through `core.setField` / `core.addItem` / etc., which mutate the document and rebuild the model. Never edit nodes in place.

---

## 6. Invariants worth knowing

- **Pointer is canonical addressing.** Every node has exactly one pointer. The renderer, validator, error map, and DOM all key off it.
- **`value` matches the schema kind.** Because `coerceData` runs in `load()` before `buildModel`, a `kind: 'integer'` node's value is a `number`, not a `string`. See [architecture.md §13](./architecture.md).
- **`buildModel` does not deep-clone.** It owns the passed `document` after the call (the rule lives at [core/model.js:69](../core/model.js)). Callers (`load`, `mutate.js`) deep-clone before handing it over.
- **Pure function.** No previous-model threading, no hidden state. Same inputs → structurally identical outputs.
- **Cost is `O(N)` in document size.** No quadratic walks, no per-keystroke serialization. See [performance-review.md §2.1](./performance-review.md) for the budget.

---

## 7. Adding a new field kind

Three places need updating, in this order:

1. **`schema.js`** — extend `inferKind` so the schema's `type` resolves to your new `kind`. Add the kind to `SUPPORTED_TYPES`.
2. **`model.js`** — if the new kind needs to recurse (like `object`/`array`) or carry extra metadata, handle it in `buildNode`. For a flat primitive, no model change is needed beyond having a `kind` value flow through.
3. **`editor.js`** — add a branch in `_renderPrimitive` (or split into a dedicated `_renderX`) for the new kind. **Never fall through to a default renderer.** An unhandled kind should be an explicit error.
4. **`validation.js`** — add the validator branch alongside `validateString` / `validateNumber` / etc., and hook it into `validateNode`.

`coerceData` in [core/index.js](../core/index.js) may also need a new branch if the kind needs load-time normalization.
