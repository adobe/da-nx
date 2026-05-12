# JSON Schema support

Reference specification for JSON Schemas consumed by this form. Defines the complete set of allowed keywords and forms. Anything not specified in this document is unsupported.

- **Dialect:** JSON Schema 2020-12
- **Audience:** schema authors and code-generation agents

> Generators must produce schemas that use only the constructs documented here. Schemas using unlisted keywords, formats, or composition forms are rejected by the form's rendering layer.

---

## 1. Authoring rules

A conformant schema satisfies every rule below.

| # | Rule |
| - | ---- |
| R1 | Every node must declare `type` explicitly. Inference from `properties`, `items`, or `enum` is not relied upon. |
| R2 | `type` must be exactly one of: `"string"`, `"number"`, `"integer"`, `"boolean"`, `"object"`, `"array"`. |
| R3 | `type` must not be an array (no `["string", "null"]`). |
| R4 | Every node must define `title`. |
| R5 | Every `object` node defines its fields via `properties`. |
| R6 | Every `array` node defines its element schema via `items` (a single schema object, not an array). |
| R7 | Repeated shapes are factored into `$defs` and referenced via `$ref`. |
| R8 | `$ref` values must be same-document JSON Pointers (`#/...`). External references are forbidden. |
| R9 | Composition keywords (`allOf`, `oneOf`, `anyOf`, `not`, `if`, `then`, `else`) are forbidden. |
| R10 | Only the keywords listed in §3, §4, §5, and §6 are permitted. |

---

## 2. Supported types

### `string`

```json
{ "type": "string", "title": "Name" }
```

When `enum` is present, the field renders as a select dropdown (see §4).

### `number`

```json
{ "type": "number", "title": "Score" }
```

Accepts any finite number.

### `integer`

```json
{ "type": "integer", "title": "Age" }
```

Rejects fractional values.

### `boolean`

```json
{ "type": "boolean", "title": "Subscribed" }
```

Defaults to `false` when not specified by `default`.

### `object`

```json
{
  "type": "object",
  "title": "Contact",
  "required": ["name"],
  "properties": {
    "name":  { "type": "string", "title": "Name" },
    "email": { "type": "string", "title": "Email" }
  }
}
```

Fields are declared in `properties`. `required` is an array of property names.

### `array`

The element schema is a single object under `items`. It may be any supported type — a primitive, an object, or another array.

Array of primitives (`string`, `number`, `integer`, `boolean`):

```json
{
  "type": "array",
  "title": "Tags",
  "items": { "type": "string", "title": "Tag" }
}
```

Array of objects:

```json
{
  "type": "array",
  "title": "Contacts",
  "items": {
    "type": "object",
    "title": "Contact",
    "required": ["name"],
    "properties": {
      "name":  { "type": "string", "title": "Name" },
      "email": { "type": "string", "title": "Email" }
    }
  }
}
```

Array of arrays (the inner array must declare its own `items`):

```json
{
  "type": "array",
  "title": "Matrix",
  "items": {
    "type": "array",
    "title": "Row",
    "items": { "type": "number", "title": "Cell" }
  }
}
```

### Nesting

Any supported type may appear inside `properties` or `items`. Objects can contain objects and arrays; arrays can contain objects, primitives, or other arrays. Nesting depth is not limited by the schema rules — keep nesting shallow for readability (see §8).

```json
{
  "type": "object",
  "title": "Order",
  "properties": {
    "customer": {
      "type": "object",
      "title": "Customer",
      "properties": {
        "address": {
          "type": "object",
          "title": "Address",
          "properties": {
            "city":    { "type": "string", "title": "City" },
            "country": { "type": "string", "title": "Country" }
          }
        }
      }
    },
    "lineItems": {
      "type": "array",
      "title": "Line items",
      "items": {
        "type": "object",
        "title": "Line item",
        "properties": {
          "sku":      { "type": "string",  "title": "SKU" },
          "quantity": { "type": "integer", "title": "Quantity", "minimum": 1 }
        }
      }
    }
  }
}
```

---

## 3. Supported annotations

These keywords describe presentation. They do not constrain the value.

| Keyword     | Type      | Applies to | Effect |
| ----------- | --------- | ---------- | ------ |
| `title`     | string    | any        | Label shown above the input. **Required on every node** (rule R4). |
| `default`   | matches type | any     | Pre-fills the field when the document has no value. |
| `readOnly`  | boolean   | any        | Disables the input. The value remains visible. |
| `required`  | string[]  | object     | Names properties whose absence shows `"This field is required."` |

`required` is declared on the parent `object`, not on the child property.

```json
{
  "type": "object",
  "title": "Article",
  "required": ["title"],
  "properties": {
    "title": { "type": "string", "title": "Title" }
  }
}
```

---

## 4. Supported constraints

These keywords restrict the value. The form shows an error under the field when violated.

| Keyword              | Type   | Applies to       |
| -------------------- | ------ | ---------------- |
| `enum`               | array  | string           |
| `minLength`          | int    | string           |
| `maxLength`          | int    | string           |
| `pattern`            | string | string (ECMA regex) |
| `minimum`            | number | number, integer  |
| `maximum`            | number | number, integer  |
| `minItems`           | int    | array            |
| `maxItems`           | int    | array            |

`enum` example:

```json
{
  "type": "string",
  "title": "Status",
  "enum": ["Planning", "Active", "Completed", "On Hold"]
}
```

`pattern` is a regular expression following the ECMA 262 grammar. Use it for shape constraints (slugs, identifiers); use `enum` for closed value sets.

```json
{
  "type": "string",
  "title": "Slug",
  "minLength": 3,
  "maxLength": 30,
  "pattern": "^[a-z0-9-]+$"
}
```

---

## 5. Supported structural keywords

| Keyword       | Type   | Notes |
| ------------- | ------ | ----- |
| `type`        | string | Rules R1–R3. |
| `properties`  | object | Required on every `object`. |
| `items`       | object | Required on every `array`. A single schema, not an array. |
| `$ref`        | string | Same-document only (`#/...`). |
| `$defs`       | object | Container for reusable schemas referenced via `$ref`. |

`$ref` and `$defs`:

```json
{
  "$defs": {
    "Contact": {
      "type": "object",
      "title": "Contact",
      "required": ["name"],
      "properties": {
        "name":  { "type": "string", "title": "Name" },
        "email": { "type": "string", "title": "Email" }
      }
    }
  },
  "type": "object",
  "title": "Project",
  "properties": {
    "owner":  { "$ref": "#/$defs/Contact" },
    "editor": { "$ref": "#/$defs/Contact" }
  }
}
```

---

## 6. Forbidden constructs

These constructs are unsupported. Schemas using them are rejected by the rendering layer. This list is not exhaustive — rule R10 applies — but enumerates the cases most likely to appear in generated schemas.

| Construct | Why unsupported |
| --------- | ---------------- |
| `allOf`, `oneOf`, `anyOf`, `not` | Composition is not supported. |
| `if`, `then`, `else`             | Conditional schemas are not supported. |
| `dependentRequired`, `dependentSchemas` | Cross-field dependencies are not supported. |
| `additionalProperties`, `patternProperties`, `propertyNames` | Object key constraints are not supported. |
| `minProperties`, `maxProperties` | Object size constraints are not supported. |
| `prefixItems`, `contains`, `minContains`, `maxContains`, `uniqueItems` | Tuple and array set constraints are not supported. |
| `const`, `multipleOf` | Not supported. |
| `exclusiveMinimum`, `exclusiveMaximum` | Not supported. Use `minimum` / `maximum`. |
| `contentEncoding`, `contentMediaType` | Content format hints are not supported. |
| `description` | Not rendered by the form. |
| `$schema`, `$id`, `$anchor`, `$comment`, `$vocabulary` | Metadata keywords not interpreted by the form. |
| `format` (all values, including `"email"`, `"uri"`, `"date"`, `"date-time"`, `"uuid"`, `"textarea"`) | Not interpreted by the form. Use `pattern` for shape validation. |
| `type` as an array (e.g. `["string", "null"]`) | A single type per node is required. |
| Schemas without `type` | Type must be declared explicitly (R1). |
| Schemas without `title` | Title is required on every node (R4). |
| External `$ref` (URL, file path, other documents) | Same-document refs only. |

---

## 7. Empty value semantics

The form treats unfilled values as absent.

- An empty string (`""`), a whitespace-only string, an empty array (`[]`), and an empty object (`{}` or one whose fields are all empty) are considered absent.
- Constraints (`enum`, `pattern`, `minLength`, etc.) are not enforced on absent optional fields.
- A `required` field that is absent produces the message `"This field is required."`
- Absent values are stripped from the saved document.

For the schema

```json
{
  "type": "object",
  "title": "Item",
  "properties": {
    "status": {
      "type": "string",
      "title": "Status",
      "enum": ["Active", "Done"]
    }
  }
}
```

| Document          | Outcome                                |
| ----------------- | -------------------------------------- |
| `{}`              | Valid. `status` is absent.             |
| `{ "status": "" }` | Valid. `status` is treated as absent. |
| `{ "status": "Other" }` | Invalid. `enum` is enforced.     |
| `{ "status": "Active" }` | Valid.                          |

---

## 8. Best practices

Conventions that produce a readable form and a maintainable schema.

- **Set `title` on every node, including `$defs` entries and `items`.** Without it the form falls back to the property name, which is rarely the right label.
- **Use `enum` for closed value sets**, not `pattern`. A select dropdown communicates intent and prevents typos.
- **Factor repeated shapes into `$defs`.** If the same object appears in two places, define it once and `$ref` to it.
- **Use `default` to seed the most likely value.** It pre-fills the input and is preserved through the absent-stripping rule because the user does not have to do anything for it to be valid.
- **Use `readOnly` for fields the user must not modify.** Useful for IDs and audit fields whose value comes from the server.
- **Reserve `required` for fields whose absence makes the document meaningless.** Do not mark a field required just to force a default — set `default` instead.
- **Keep the schema flat.** A flat list of fields is easier to scan than a tree of nested objects.

---

## 9. Complete example

A schema exercising every supported keyword:

```json
{
  "$defs": {
    "Contact": {
      "type": "object",
      "title": "Contact",
      "required": ["name"],
      "properties": {
        "name":  { "type": "string", "title": "Name" },
        "email": { "type": "string", "title": "Email" }
      }
    }
  },
  "type": "object",
  "title": "Project",
  "required": ["title", "slug", "status"],
  "properties": {
    "title": {
      "type": "string",
      "title": "Title",
      "default": "Untitled project"
    },
    "slug": {
      "type": "string",
      "title": "Slug",
      "minLength": 3,
      "maxLength": 30,
      "pattern": "^[a-z0-9-]+$"
    },
    "summary": {
      "type": "string",
      "title": "Summary",
      "maxLength": 280
    },
    "status": {
      "type": "string",
      "title": "Status",
      "enum": ["Planning", "Active", "Completed", "On Hold"],
      "default": "Planning"
    },
    "priority": {
      "type": "integer",
      "title": "Priority",
      "minimum": 1,
      "maximum": 5,
      "default": 3
    },
    "score": {
      "type": "number",
      "title": "Score",
      "minimum": 0,
      "maximum": 100
    },
    "archived": {
      "type": "boolean",
      "title": "Archived",
      "default": false
    },
    "ownerId": {
      "type": "string",
      "title": "Owner ID",
      "readOnly": true
    },
    "tags": {
      "type": "array",
      "title": "Tags",
      "minItems": 1,
      "maxItems": 10,
      "items": { "type": "string", "title": "Tag" }
    },
    "owner": {
      "$ref": "#/$defs/Contact"
    },
    "collaborators": {
      "type": "array",
      "title": "Collaborators",
      "items": { "$ref": "#/$defs/Contact" }
    }
  }
}
```

---

## 10. Quick reference

| Keyword                                                                                             | Status |
| --------------------------------------------------------------------------------------------------- | ------ |
| `type`: `"string"`, `"number"`, `"integer"`, `"boolean"`, `"object"`, `"array"`                     | Supported |
| `title`, `default`, `readOnly`, `required`                                                          | Supported |
| `enum`, `minLength`, `maxLength`, `pattern`                                                         | Supported |
| `minimum`, `maximum`                                                                                | Supported |
| `minItems`, `maxItems`                                                                              | Supported |
| `properties`, `items`                                                                               | Supported |
| `$ref` (`#/...`), `$defs`                                                                           | Supported |
| All other keywords, formats, composition forms, and constructs (see §6)                            | **Forbidden** |
