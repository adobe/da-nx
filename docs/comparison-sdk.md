# Workspace comparison actions

The SDK exposes additive actions for an EW host with `capabilities.comparison === 1`:

```js
const { actions, capabilities } = await DA_SDK;
if (capabilities?.comparison === 1) {
  const result = await actions.openComparison({ candidate: 'document', baseline: 'live' });
}
```

`candidate` is `document` (current editor contents) or `preview` (current staged content). `baseline` is `live`. The host determines the page from its own context; arbitrary URLs, HTML, and other pages are not accepted. Opening comparison is read-only. `actions.closeComparison()` closes the surface without changing the editor or right-rail instance.

A separate `capabilities.saveDocument === 1` enables `actions.saveDocument()`. This asks the host to persist pending document changes and resolves when the host acknowledges the result.

All three actions resolve to `{ ok: true }` or `{ ok: false, error }`. Hosts acknowledge on the transferred MessagePort with `{ action: 'sdkResponse', requestId, result }`. Calls carry `{ action, requestId, details }`; comparison details contain only `candidate` and `baseline`. Unsupported hosts return `unsupported` locally without a message. Missing acknowledgements time out after 15 seconds without retrying. An action method's presence alone does not establish host support: the SDK and host can deploy independently.

Hosts that do not advertise these capabilities retain their existing behavior.
