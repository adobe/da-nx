# Rich-text fields

String properties marked `"x-semantic-type": "rich-text"` render as
`<form-richtext>`, a small ProseMirror editor with a formatting toolbar. Other
strings are unchanged. `long-text` stays a plain `<form-textarea>`, so rich text
is strictly opt-in per schema property.

```json
{ "type": "string", "title": "Body", "x-semantic-type": "rich-text" }
```

## Value contract

The field value is a string of canonical HTML, owned by the SDK
(`@adobe/da-sc-sdk`, `src/html/rich-text.js`).

- Allowed blocks are `p`, `h1` to `h6`, `blockquote`, `ul`, `ol` and `li`.
  Lists may nest. Quotes hold paragraphs, headings, lists and quotes. List
  items hold text only, so headings and quotes inside `li` are flattened.
- Allowed inline elements are `strong`, `em`, `u`, `s`, `code`, `sup`, `sub`,
  `a[href][title]` and `br`. `b`, `i`, `strike` and `del` normalize to
  `strong`, `em` and `s`. The field nests links outermost and `code` innermost.
  `sup` and `sub` exclude each other.
- `pre` is flattened to paragraphs. Whitespace collapsing would break code
  blocks, so the toolbar offers inline code only.
- `href` must be relative, `http(s):`, `mailto:` or `tel:`. Unsafe links are
  unwrapped to their text. An optional `title` is kept with whitespace
  collapsed and trimmed. An empty title is dropped.
- Whitespace collapses, empty blocks are dropped, and an empty editor is `''`.
  The form then clears the field.
- Plain text without tags is read as paragraphs (blank lines) and `<br>`
  (single newlines), so a property switched from `long-text` keeps its content.

The field's serializer ([`richtext-utils.js`](../fields/richtext-utils.js))
emits the same canonical form, so a value produced in the editor is stable
when it passes through the SDK sanitizer.

## Storage

The SDK picks the rich-text codec from the field's semantic type. It only
treats a value as markup when it knows that type.

- `convertJsonToHtml({ json, model })` writes the sanitized HTML into the
  block cell instead of escaping it. The model carries the semantic type.
- `convertHtmlToJson({ html, schema })` reads the cell's inner HTML back. No
  model exists at load time, so the reader takes the schema.

[`utils/persistence.js`](../utils/persistence.js) already passes the engine
model on save. [`utils/context.js`](../utils/context.js) parses once without a
schema to find `x-schema-name`, then re-reads with the resolved schema. If that
read fails it keeps the schema-less result. Without a model or schema, both
converters treat every value as plain text.

## Editor

The editor lives in [`fields/richtext.js`](../fields/richtext.js).

- **ProseMirror is not bundled in nexter.** It is lazily imported through the
  bare `da-y-wrapper` specifier, which the host page's import map resolves. On
  da.live that is the same bundle the canvas and quick-edit use, so the browser
  shares one cached copy. Undo and redo require da-live to export `history`,
  `undo` and `redo` from `prosemirror-history` in that bundle. Without them the
  field still works, the history shortcuts are skipped and the undo and redo
  buttons are hidden.
- The toolbar is ordered by priority, since the last tools overflow first. It
  starts with undo and redo, which are disabled while there is nothing to undo
  or redo. A paragraph and heading picker follows (the shared `nx-picker`,
  lazily imported and disabled inside lists). Then come bold, italic, underline and
  strikethrough, followed by link, remove link and inline code. Numbered and
  bulleted lists, blockquote, superscript and subscript always live in a "more"
  menu. That menu opens from the S2 `more` icon rotated to a vertical position,
  in a lazily imported `nx-popover`, and is grouped as lists, blocks and text.
  There are no indent or outdent buttons. `Tab` and `Shift-Tab` nest list
  items, as in most editors.
  Unlike the floating canvas toolbar, the field's toolbar is part of the
  layout, so it should not re-flow as the selection moves. Remove link is the
  exception, as in the canvas. It only takes space while the selection
  touches a link, and the overflow split is recomputed when it appears.
  The toolbar is a single line. Bar tools that would wrap are hidden (keeping
  their slots) and offered at the start of the more menu. A `ResizeObserver`
  recomputes the split when the field or picker resizes. The menu stays open
  while tools are used and closes on Escape, an outside click or opening the
  link dialog.
  The pressed, picker and enabled states follow the selection only while the
  field (editor, toolbar or link dialog) has focus. A blurred field shows a
  neutral toolbar, since ProseMirror keeps a selection (initially the start
  of the document) even when not focused.
  Icons are the S2 SVGs from `${codeBase}/img/icons`, loaded lazily with text
  fallbacks.
- A floating toolbar appears next to a non-empty selection while the field has
  focus, so long fields need no scrolling back to the top. It holds bold,
  italic, underline, strikethrough, link, remove link and inline code, plus a
  more button whose menu shows only the lists, blockquote and scripts. It sits
  above the selection, or below it when it would cover the fixed toolbar. It is
  centered on the first selected line and kept inside the field frame. It
  hides when the selection collapses, the field loses focus, the link dialog
  opens or the selection scrolls out of view. Its buttons duplicate the fixed
  toolbar, so they are left out of the tab order.
- The editor supports these shortcuts.
  - `Mod-B`, `Mod-I` and `Mod-U` for bold, italic and underline
  - `Mod-E` for inline code and `Shift-Mod-X` for strikethrough
  - `Mod-.` and `Mod-,` for superscript and subscript
  - `Mod-Alt-0` for a paragraph and `Mod-Alt-1` to `Mod-Alt-6` for headings,
    as in da-live
  - `Shift-Mod-9` for blockquote, `Shift-Mod-8` and `Shift-Mod-7` for lists
  - `Mod-K` to add a link and `Shift-Mod-K` to remove it
  - `Tab` and `Shift-Tab` to indent and outdent list items
  - `Shift-Enter` for a line break
  - `Mod-Z`, `Shift-Mod-Z` and `Mod-Y` for history
- List items here hold only text, so ProseMirror's list commands, which
  first merge the selected blocks into one item, can't handle several rows.
  A list button wraps each selected paragraph or heading in its own item.
  Headings become paragraphs, and a selection that includes a quote is left
  alone. The active list button lifts every selected item out to a
  paragraph one at a time. Lifting a nested item splits the surrounding
  lists, so items after it start a new top-level list. `Enter` is
  ProseMirror's standard `splitListItem`.
- The content grows with its text up to 480px, then scrolls. Like the
  textarea it can be resized vertically. A dragged height replaces the cap.
- Links are edited in the shared [`nx-link-dialog`](../../../../docs/link-dialog.md),
  the same URL, display text and title dialog as the canvas toolbar. It opens
  with the link and text around the selection. Changing the display text
  replaces the linked text like the canvas does. Unsafe URLs show an error
  instead of being applied.
- `input` fires with the canonical value whenever it changes and is
  debounced by [`views/editor.js`](../views/editor.js) like other text fields.
  `change` fires on blur after an edit and commits immediately, so pending
  input is never dropped. An external `value` only replaces the document when
  it differs from what the field last emitted, preserving the selection while
  typing.

## Why not reuse the canvas toolbar

da-live's canvas selection toolbar is coupled to the canvas `EditorView`, its
full document schema (tables, blocks, images, comments) and surface focus
management. A form field needs a tiny schema whose output is exactly the
canonical subset above, so the field defines its own schema and commands and
only shares ProseMirror itself.

## Release order

1. Release `@adobe/da-sc-sdk` with the rich-text semantic type and codec,
   then bump it here and run `npm run build:da-sc-sdk`. Until then the old
   dist stores rich-text values escaped.
2. Deploy da-live's `da-y-wrapper` with `history`, `undo` and `redo` exports.
   Until then the undo and redo buttons stay hidden.

## Testing

Unit tests replace the `da-y-wrapper` import with
`test/nx/blocks/form/fields/mocks/pm.js`. It re-exports the ProseMirror npm
packages (dev dependencies only) under the da-y-wrapper names.

- `fields/richtext-utils.test.js` covers the schema, parsing, canonical
  serialization, commands, floating toolbar placement and parity with the
  bundled SDK codec.
- `fields/richtext.test.js` covers component behavior, the toolbar, links and
  events.
- `views/editor.test.js` covers rendering and the immediate commit on `change`.
