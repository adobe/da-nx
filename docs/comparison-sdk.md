# Workspace comparison actions

See [SDK messaging](sdk-messaging.md) for when to use fire-and-forget commands or completion responses.

The SDK exposes comparison actions for the EW host:

```js
const { actions } = await DA_SDK;
actions.openComparison({ candidate: 'document', baseline: 'live' });
```

`candidate` is `document` (current editor contents) or `preview` (current staged content). `baseline` is `live`. The host determines the page from its own context; arbitrary URLs, HTML, and other pages are not accepted. Opening comparison is read-only. `actions.closeComparison()` closes the surface without changing the editor or right-rail instance.

`openComparison()` and `closeComparison()` are synchronous, fire-and-forget actions. They return `undefined` and do not wait for a host response. They send `{ action: 'openComparison', details: { candidate, baseline } }` and `{ action: 'closeComparison' }` on the transferred MessagePort, without request IDs, response listeners, or timers. Invalid comparison options throw `TypeError('invalid-comparison')` before sending; MessagePort posting errors propagate synchronously.

`actions.saveDocument()` asks the host to persist pending document changes. It remains awaitable so consumers can wait for saving before previewing or opening a preview comparison:

```js
const result = await actions.saveDocument();
if (result.ok) {
  actions.openComparison({ candidate: 'preview', baseline: 'live' });
}
```

Save calls send `{ action: 'saveDocument', requestId }`. The host acknowledges on the same MessagePort with `{ action: 'sdkResponse', requestId, result }`, where `result` is `{ ok: true }` or `{ ok: false, error }`. Each save waits only for its matching reply, including concurrent saves with out-of-order replies. Unrelated messages are ignored. Missing acknowledgements resolve to `{ ok: false, error: 'timeout' }` after 15 seconds without retrying. Malformed matching replies resolve with `invalid-response`; port setup or posting failures resolve with `disconnected`. Each settled save removes its response listener and clears its timer.

There is no capability or version negotiation. EW versions without these actions ignore comparison messages; unacknowledged saves time out. The SDK initializes only from a message with `ready: true` and a transferred MessagePort, and subsequent messages do not replace that port. Action presence alone does not establish host support because the SDK and EW can deploy independently.
