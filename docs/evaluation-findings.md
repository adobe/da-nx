# Evaluation findings on the page

Lets a host that owns the page (the da.live canvas) show the failures of a `PageEvaluationWithIcons` chat result on the
page itself, instead of in the widget's own dialog. da-nx owns the contract; the host implements it.

## Flow

1. The chat widget (`nx2/blocks/chat-ao/artifacts/page-evaluation.js`) turns every item with a `suggestion` into an `EvalFinding`.
2. "View failure" dispatches `EVAL_EVENT.FOCUS_FINDING` on `document` only when that suggestion includes supported
   evidence. A host that can locate the finding calls `event.preventDefault()`. If nobody claims it, or the suggestion has
   no evidence, the widget opens its own dialog (unchanged behaviour). Items with only a `check` keep opening the check
   dialog.
3. The host resolves the evidence on the page, draws it through the quick-edit iframe (see below) and opens a popover that
   only explains the failure (title, summary, context, previous/next failure on the same element). The da.live canvas popover
   has no Apply or Add to chat actions; suggestions are generated from the chat card instead.

## `EvalFinding`

Built by `toEvalFindings(data)` (exported from `page-evaluation.js`) for all sections, in order.

```js
{
  id,            // item.id ?? `${sectionIndex}-${itemIndex}`, unique within the artifact
  title,         // check title, e.g. "Header copy"
  description?,  // item.description
  label?, assetType?, issue?, suggested?, // from item.suggestion
  context?,      // suggestion.context as-is (object or array)
  evidence,      // suggestion.evidence ?? []
}
// Evidence
{ anchorType: 'text', anchorText, replacement? }  // anchorText = verbatim quote from the DA source text
{ anchorType: 'image', src }                       // rendered image URL
```

Evidence is produced by the governance agent (`evidence` on failed checks) and travels in `suggestion.evidence` of the artifact.
Both the flat A2UI and the legacy nested artifact shapes work.

### Matching rules and limits

- `anchorText` is matched case-sensitively against the document text, after normalizing whitespace and typographic quotes.
  Quote the source, not the rendered page: CSS `text-transform` can show "OUR STORY" for a source "Our story".
- Image evidence is matched by the media file name (`media_<hash>`) of `src`, not the full URL.
- Text outside the document (header, nav and footer fragments) can't be located; the host shows the finding unanchored.
- The host anchors a located quote with the comments `encodeAnchor`/`decodeAnchor` helpers, so the marker follows edits.
  Findings are not persisted.

## `FOCUS_FINDING`

`nx2/utils/evaluation-events.js`: `EVAL_EVENT.FOCUS_FINDING = 'nx-eval-focus-finding'`, `cancelable: true`,
`detail: { findingId, findings }` where `findings` is every finding of that artifact.

## Quick-edit messages

Host to iframe `SET_FINDING_MARKERS`; iframe to host `FINDING_MARKER_CLICK` and `FINDING_MARKER_LAYOUT`. Shapes live in
`nx/utils/message-types.js`; purpose and hosts in [quick-edit-events.md](./quick-edit-events.md).

Any `nx-page-eval` on the page can dispatch this event, including the Preflight panel when its suggestions include evidence.
Suggestions without evidence fall back to their original dialog and are not claimed by a host.

## Add to chat pill

A host can add a finding to the chat input with `CHAT_EVENT.ADD_TO_CHAT` (the da.live popover no longer does):

```js
{ key: 'eval-finding', id: 'eval-<finding.id>', type: 'evaluation-finding', name: <title>, description: <details> }
```

`type: 'evaluation-finding'` is carried end to end in `nx-chat-ao`: the pill shows `name` with an alert icon;
`client_context.focused_resources` gets `{ type, id, name, description }` (the description is plain text for the agent, the
id only identifies the pill — see [chat-ao-component.md#client-context](./chat-ao-component.md#client-context)); the stored
user message keeps `selectionContext: [{ type, blockName: name, description }]`, which is also rebuilt from history on reload.
Other pill types are unchanged.

## Dev fixture switch

`?nx-eval-fixture=<name>` on any page that mounts `nx-chat-ao` appends an assistant message that renders
`nx2/blocks/chat-ao/dev/fixtures/<name>.artifact.json` once the chat history has loaded, without contacting AO
(`<name>` is limited to `[a-z0-9.-]`; `frescopa-draft.nested` selects the legacy nested form; a missing file only logs a
`console.warn`). Switching episodes drops the message. Fixture contents and what each case tests:
`nx2/blocks/chat-ao/dev/fixtures/README.md`.

## Applying a finding

The host doesn't edit the document. A host that offers an apply action sends a plain instruction (element, current text,
replacement) to the chat, and the agent edits through its AEM/DA tools (`da_get_source` → confirm → `da_update_source`). That needs an AO manifest with authoring
tools, such as `experience-workspace`. A user whose default manifest is evaluation-only (for example `governance`) gets
"no authoring capability"; select the manifest with the `ew.coworkerManifest` flag or `?nx-chat-ao-manifest=`.
