# Canvas editor extension SDK (local prototype)

Import `nx/utils/sdk.js` and await its default export. The canvas host advertises
`capabilities.editor === 1`. Older hosts do not support these methods; calls
reject with `UNSUPPORTED` instead of waiting for a reply.

```js
const { actions, capabilities } = await DA_SDK;
if (!capabilities?.editor) throw new Error('A canvas editor host is required.');

const unsubscribe = await actions.subscribeDocument((snapshot) => {
  // Full live instrumented HTML plus source-backed block/field descriptions.
});
```

Snapshots contain `documentId`, `revision`, `html`, `editable`, `blocks`, and
`selectedBlock`. There is an initial snapshot, one for every document change
(including undo/redo and remote transactions), and selection-only updates with
an unchanged revision. The HTML uses the current canvas AEM preview serializer:
its existing metadata, icon, and URL normalization limitations still apply.
Field descriptions preserve source text, hrefs, image sources, and supported
editing/read-only rules without exposing ProseMirror objects.

No document is represented explicitly by `available: false`, `documentId: null`,
empty HTML/blocks, and `editable: false`. Call the returned async unsubscribe
function when disposing the extension.

## Targets and concurrency

An HTML target is `{ attribute: 'data-prose-index', index: 5 }`, or a
`data-image-index`/`data-block-index` target. Only addresses issued in the current
snapshot are valid. These are content/node positions with host-owned resolution,
not stable IDs or arbitrary editor offsets.

Block descriptions expose content rows (excluding the header), cells, fields,
and list items. Their `target` adds typed `rowIndex`, `cellIndex`, `fieldIndex`,
and optional `itemIndex` subcoordinates to the existing block index. Echo these
targets rather than guessing positions or interpreting them as ProseMirror paths.

```js
await actions.applyChanges({
  documentId: snapshot.documentId,
  revision: snapshot.revision,
  changes: [{ type: 'setText', target: field.target, value: 'New title' }],
});
```

The host requires the exact document session and current revision. Do not retry
a stale write against a new target/revision automatically. Preserve the draft
and let the user review it against the latest snapshot. Batch disjoint changes
atomically; overlapping targets are rejected.

## Actions

| Action | Arguments / behavior |
| --- | --- |
| `describeBlock` | `{ html }`: normalize one original library table into the same plain field description, without targets. |
| `applyChanges` | `{ documentId, revision, changes }`: one validated host transaction, preserving selection. |
| `selectTarget` | `{ documentId, revision, target }`: select/reveal existing content without granting write access. |
| `uploadImage` | `{ documentId, revision, target, file }`: upload a structured-clone File and replace the scoped image after revalidation. |
| `pickAsset` | `{ documentId, revision, target }`: open the host AEM Assets dialog for one image. |
| `openBlockLibrary` | `{ documentId, revision, target }`: open the host block library to replace one block. |
| `getEditorConfig` | Returns `{ hasAemAssets, configs }` for the current organization/site; configs contain the org/site library configuration. |

Supported changes:

- `setText`: `{ target, value }`; preserves uniform supported marks.
- `setLink`: `{ target, href }`; updates an existing text field's link.
- `changeList`: `{ target, from, to }`; `from: null` appends, `to: null`
  removes, otherwise moves to a final zero-based index. At least one item remains.
- `setBlockVariant`: `{ target, value }`.
- `appendBlockRow`: `{ target, html }`; original library `<tr>` HTML.
- `deleteBlockRow`: `{ target, rowIndex }`.
- `moveBlockRow`: `{ target, from, to }`; final zero-based content-row indexes.
- `replaceBlock`: `{ target, html }`; original library `<table>` HTML, not
  reconstructed preview divs.

Writes acknowledge `{ documentId, revision }`. Dialog cancellation returns
`{ cancelled: true }` without changing the document. An image upload can succeed
while replacement fails due to a stale document; that can leave an unused asset.

Failures reject an Error with `code`: `UNSUPPORTED`, `UNAVAILABLE`,
`WRONG_DOCUMENT`, `STALE_REVISION`, `READ_ONLY`, `INVALID_TARGET`,
`INVALID_CHANGE`, `UPLOAD_FAILED`, or `TIMEOUT`. Regular requests time out after
30 seconds; upload and modal requests after five minutes. Transport requests are
correlated, and closing the channel rejects pending requests.

Existing SDK actions (insertion, selected HTML, fetch, navigation, panels, and
chat prompts) remain available and unchanged.
