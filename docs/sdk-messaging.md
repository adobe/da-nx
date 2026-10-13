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

## Timeouts and host support

After 15 seconds without a reply, the SDK returns `{ ok: false, error: 'timeout' }` (`getSelection()` rejects with `timeout`). The host may still complete the operation. Timeout does not cancel it, and the SDK does not retry. Do not automatically retry a mutation or continue work that needed a successful response. Request IDs correlate replies; they do not prevent duplicate execution.

The SDK and EW deploy independently, without capability negotiation. A method's presence does not prove EW support: unsupported commands may be ignored, and acknowledged calls time out. This includes `getSelection()`: against a host that only knows the old reply, it rejects with `timeout`, so the host change has to ship before this SDK.

Add acknowledgements only when a caller needs completion. Define success and failure results, implement the matching EW response, and test correlation, concurrent calls, malformed replies, timeout, and cleanup. Reuse the helper for any action that waits for the host.
