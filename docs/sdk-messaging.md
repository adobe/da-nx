# SDK messaging

Use fire-and-forget when the caller does not need to wait for the host. `openComparison()` and `closeComparison()` post UI commands and return `undefined`; the host shows loading and errors.

Wait for a response when the next step depends on completion. Request Publish waits for `saveDocument()` to return `{ ok: true }` before previewing source content, even when comparison was never opened. Comparison also attempts a save, with a read-only fallback, but its fire-and-forget command does not confirm completion to the caller. Save success does not imply preview or publication success, or prevent later edits. See [Workspace comparison actions](comparison-sdk.md) for the API details.

## Requests and responses

Actions use the MessagePort transferred in the `ready` handshake. Each acknowledged call gets a unique `requestId`; the host replies on the same port with that ID:

```js
// SDK to host
{ action: 'saveDocument', requestId }

// Host to SDK, on the same MessagePort
{ action: 'sdkResponse', requestId, result: { ok: true } }
// Or, on failure
{ action: 'sdkResponse', requestId, result: { ok: false, error: 'save-failed' } }
```

`getSelection()` uses the same request and reply. A successful result carries the selected HTML:

```js
{ action: 'getSelection', requestId }
{ action: 'sdkResponse', requestId, result: { ok: true, html: '<p>Selected text</p>' } }
{ action: 'sdkResponse', requestId, result: { ok: false, error: 'No selection found' } }
```

The SDK turns this result into the promise `getSelection()` has always returned: it resolves with the HTML string and rejects with a string, either the host's message (`No selection found`, `No editor view`) or one of the SDK errors below. Hosts still answer a `getSelection` request without a `requestId` the old way (a `sendSelection` window message, or an `error` message on the port), so plugins that bundle an older copy of the SDK keep working.

EW replies after the operation finishes, including failures, and rejects requests from stale page contexts.

The private `handleSdkResponse` helper registers a listener before sending and accepts only `sdkResponse` replies with the matching request ID. Concurrent calls can finish in any order. Each call removes its listener and clears its timer when it settles; unrelated and late replies are ignored.

Results require a boolean `ok`. Malformed matching replies return `invalid-response`; port setup or posting failures return `disconnected`. For `saveDocument()` these errors resolve as `{ ok: false, error }`; `getSelection()` rejects with the error string, and also rejects with `invalid-response` when a successful result has no `html` string.

## Live HTML replacement

`sendHTML(html)` and `sendHTML(html, { replace: false })` retain their fire-and-forget
insertion behavior. Canvas hosts advertising `capabilities.sendHTMLReplace === 1`
also support acknowledged replacement:

```js
const result = await actions.sendHTML(blockHtml, {
  replace: true,
  // Optional guard, using the latest live document subscription snapshot.
  expected: { html: snapshot.html, blockIndex: snapshot.selection.blockIndex },
});
if (!result.ok) {
  // Keep the draft and surface result.error (and result.message if present).
}
```

Inside an EDS block, replacement targets the entire block. Outside a block it
targets the enclosing document-level paragraph, heading, whole list or blockquote;
an explicitly selected image targets that image. Cross-target selections, empty
HTML, multiple replacement nodes and schema-invalid replacements are rejected.
Replacement accepts EDS block divs or editor-compatible HTML. It preserves the
local selection where possible without focusing the host or scrolling it.

The SDK sends `{ action: 'sendHTML', requestId, details: { html, replace: true,
expected? } }`. The host checks write permission and, when supplied, the expected
document HTML and selected zero-based block ordinal before mutating. It replies
with `{ ok: true, html, selection: { blockIndex }, editable }`, containing the
updated live document, or `{ ok: false, error, message }`. Success confirms the
editor transaction, **not** durable persistence, preview or publication. Normal
collaboration, autosave and undo handle the change.

If post-replacement serialization fails, the host still acknowledges the applied
edit with `ok: true` and `html: null`. Do not retry the replacement; wait for a fresh
live document snapshot before making another guarded edit.

Unsupported hosts return `{ ok: false, error: 'unsupported' }` from the SDK
without sending a command; replacement never degrades into insertion. Host errors
include `READ_ONLY`, `NO_TARGET`, `CROSS_TARGET`, `INVALID_HTML`, `WRONG_SELECTION`
and `STALE_LIVE`. Transport errors use the standard `timeout`, `disconnected` and
`invalid-response` results. Do not automatically retry timed-out mutations.

## Live document subscriptions

The `ready` handshake advertises `capabilities: { liveDocument: 1 }` when the host supports live document subscriptions. Check this capability and `typeof actions.subscribeLiveDocument === 'function'` before using the API; a method bundled in the SDK does not establish host support.

```js
const unsubscribe = actions.subscribeLiveDocument(({ html, selection, editable }) => {
  // html is the complete live <main> element; selection.blockIndex is a
  // zero-based document-wide block ordinal, or null outside a block.
  // editable reflects the host editor's write permission when supplied.
});
// When the consumer is finished:
unsubscribe();
```

The SDK sends `{ action: 'subscribeLiveDocument' }` on the transferred MessagePort for the first subscriber. The host replies with `{ action: 'liveDocument', html: '<main>...</main>', selection: { blockIndex: 0 } }` and sends further full snapshots when the document changes. Selection-only changes arrive as `{ action: 'liveSelection', selection: { blockIndex: null } }`. Both message types invoke subscribers with `{ html, selection }`: selection-only notifications retain the most recent full HTML. They are ignored until the first snapshot. Later subscribers immediately receive the most recent snapshot, if available. The last unsubscribe removes the SDK listener, sends `{ action: 'unsubscribeLiveDocument' }`, and discards cached HTML, so a new subscription waits for a fresh snapshot. Unsubscribe is safe to call more than once.

Selection-only notifications retain the latest `editable` flag as well as HTML.
If the immediate cached-snapshot callback throws, registration is rolled back and
the error is rethrown. Errors in later notification callbacks are logged without
interrupting other subscribers; the failing subscriber remains registered until
its unsubscribe function is called.
Subscription HTML and replacement acknowledgements preserve each image's original
editor `src` and use that URL for its picture sources, including cross-site and
external images. They do not apply the site preview's image URL rewriting.
Extensions can round-trip unchanged images without reconstructing their origin.
These notifications are not `sdkResponse` replies and have no `requestId`; they do not settle pending `getSelection()`, replacement or `saveDocument()` calls. `getSelection()` remains a one-shot request for selected HTML, independent of this live-document stream.

## Timeouts and host support

After 15 seconds without a reply, the SDK returns `{ ok: false, error: 'timeout' }` (`getSelection()` rejects with `timeout`). The host may still complete the operation. Timeout does not cancel it, and the SDK does not retry. Do not automatically retry a mutation or continue work that needed a successful response. Request IDs correlate replies; they do not prevent duplicate execution.

The SDK and EW deploy independently. The `liveDocument` and `sendHTMLReplace`
capabilities are advertised in the ready handshake; other actions do not negotiate
host support. An action's presence does not prove EW support. Unsupported commands
may be ignored, and acknowledged calls time out. This includes `getSelection()`:
against a host that only knows the old reply, it rejects with `timeout`, so the host
change has to ship before this SDK.

Add acknowledgements only when a caller needs completion. Define success and failure results, implement the matching EW response, and test correlation, concurrent calls, malformed replies, timeout, and cleanup. Reuse the helper for any action that waits for the host.
