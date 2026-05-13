# JSON Schema support

Reference specification for JSON Schemas consumed by this form. Defines the complete set of allowed keywords and forms.

- **Dialect:** JSON Schema 2020-12 (subset — see rules and supported keywords below)
- **Audience:** schema authors and code-generation agents

> A conformant schema uses only the constructs documented here. Anything else has no effect on the form.

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
| R8 | `$ref` values must be same-document JSON Pointers (`#/...`). |
| R9 | Property keys must begin with a letter (`a–z`, `A–Z`) and contain only letters, digits (`0–9`), and hyphens (`-`). |
| R10 | The property keys `metadata` and `section-metadata` are reserved. They must not appear in `properties`. |

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

#### Property key rules

Property keys must begin with a letter (`a–z`, `A–Z`) and contain only letters, digits (`0–9`), and hyphens (`-`).

```
valid:   name  firstName  first-name  My-Field  field1  h1
invalid: _name  my.field  123abc
```

The keys `metadata` and `section-metadata` are reserved and must not appear in `properties`.

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

`minimum` and `maximum` are inclusive bounds. For numeric range constraints, only these are supported.

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

## 6. Scope

Any keyword, type, or construct not listed in §2–5 has no effect on the form.

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

A schema exercising every supported keyword, including reusable shapes that reference each other and inline nested structures:

```json
{
  "$defs": {
    "Address": {
      "type": "object",
      "title": "Address",
      "required": ["country"],
      "properties": {
        "street":  { "type": "string", "title": "Street" },
        "city":    { "type": "string", "title": "City" },
        "country": { "type": "string", "title": "Country" }
      }
    },
    "Contact": {
      "type": "object",
      "title": "Contact",
      "required": ["name"],
      "properties": {
        "name":    { "type": "string", "title": "Name" },
        "email":   { "type": "string", "title": "Email" },
        "address": { "$ref": "#/$defs/Address" }
      }
    },
    "Milestone": {
      "type": "object",
      "title": "Milestone",
      "required": ["name"],
      "properties": {
        "name":      { "type": "string", "title": "Name", "minLength": 1, "maxLength": 80 },
        "completed": { "type": "boolean", "title": "Completed", "default": false },
        "owner":     { "$ref": "#/$defs/Contact" }
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
    },
    "milestones": {
      "type": "array",
      "title": "Milestones",
      "items": { "$ref": "#/$defs/Milestone" }
    },
    "links": {
      "type": "array",
      "title": "Links",
      "items": {
        "type": "object",
        "title": "Link",
        "required": ["url"],
        "properties": {
          "label": { "type": "string", "title": "Label" },
          "url":   { "type": "string", "title": "URL", "pattern": "^https?://" }
        }
      }
    }
  }
}
```
