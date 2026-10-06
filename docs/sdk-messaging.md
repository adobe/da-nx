# SDK messaging

Use fire-and-forget when the caller does not need to wait for the host. `openComparison()` and `closeComparison()` post UI commands and return `undefined`; the host shows loading and errors.

Wait for a response when the next step depends on completion. Request Publish waits for `saveDocument()` to return `{ ok: true }` before previewing source content. Save success does not imply preview or publication success, or prevent later edits. See [Workspace comparison actions](comparison-sdk.md) for the API details.

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

EW replies after the operation finishes, including failures, and rejects requests from stale page contexts.

The private `handleSdkResponse` helper registers a listener before sending and accepts only `sdkResponse` replies with the matching request ID. Concurrent calls can finish in any order. Each call removes its listener and clears its timer when it settles; unrelated and late replies are ignored.

Results require a boolean `ok`. Malformed matching replies return `invalid-response`; port setup or posting failures return `disconnected`. These errors resolve as `{ ok: false, error }`.

## Timeouts and host support

After 15 seconds without a reply, the SDK returns `{ ok: false, error: 'timeout' }`. The host may still complete the operation. Timeout does not cancel it, and the SDK does not retry. Do not automatically retry a mutation or continue work that needed a successful response. Request IDs correlate replies; they do not prevent duplicate execution.

The SDK and EW deploy independently, without capability negotiation. A method's presence does not prove EW support: unsupported commands may be ignored, and acknowledged calls time out.

Add acknowledgements only when a caller needs completion. Define success and failure results, implement the matching EW response, and test correlation, concurrent calls, malformed replies, timeout, and cleanup. Reuse the helper where it fits; leave older reply mechanisms such as `getSelection()` unchanged.
