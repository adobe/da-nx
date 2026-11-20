# Workspace comparison actions

See [SDK messaging](sdk-messaging.md) for when to use fire-and-forget commands or completion responses.

The SDK exposes comparison actions for the EW host:

```js
const { actions } = await DA_SDK;
actions.openComparison({ candidate: 'document', baseline: 'live' });
```

`candidate` is `document` (current editor contents), `preview` (current AEM preview content), or a full DA source path. `baseline` is `live` or a full DA source path. The named modes use the host's current page; a source path identifies its own document and may belong to another org or site, subject to the current user's DA permissions.

```js
actions.openComparison({
  candidate: '/org/site/.da/campaigns/spring.html',
  baseline: '/org/site/campaigns/spring.html',
});
```

Paths have the form `/org/site/document`, with an optional `.html` suffix, and are loaded through authenticated DA source with cache busting. They are not relative to the current site and do not refer to AEM preview or published content. Both operands can be paths, or either can be combined with its supported named mode. URLs, HTML, empty path segments, traversal, percent escapes, backslashes, whitespace, control characters, query strings, and fragments are not accepted. Source read failures appear in the host surface; missing source documents are errors, not empty baselines. Each document's relative URLs resolve against its own delivery origin and path. The source paths label the baseline and candidate in the host viewer.

Opening a `document` or `preview` comparison first attempts to save the current document. If the editor is read-only, comparison opens without saving; other save failures appear in the comparison surface. A source-path candidate does not save or serialize the editor. Opening comparison never updates preview or publishes content. Source-to-source comparisons show saved content only, do not navigate the editor, and reread both documents on refresh. `actions.closeComparison()` closes the surface without changing the editor or right-rail instance.

`openComparison()` and `closeComparison()` are synchronous, fire-and-forget actions. They return `undefined` and do not wait for a host response. They send `{ action: 'openComparison', details: { candidate, baseline } }` and `{ action: 'closeComparison' }` on the transferred MessagePort, without request IDs, response listeners, or timers. Invalid comparison options throw `TypeError('invalid-comparison')` before sending; MessagePort posting errors propagate synchronously.

`actions.saveDocument()` asks the host to persist pending document changes. Consumers that need a completed save before previewing must await this action, even if comparison was never opened:

```js
const result = await actions.saveDocument();
if (result.ok) {
  actions.openComparison({ candidate: 'preview', baseline: 'live' });
}
```

Save calls send `{ action: 'saveDocument', requestId }`. The host acknowledges on the same MessagePort with `{ action: 'sdkResponse', requestId, result }`, where `result` is `{ ok: true }` or `{ ok: false, error }`. Each save waits only for its matching reply, including concurrent saves with out-of-order replies. Unrelated messages are ignored. Missing acknowledgements resolve to `{ ok: false, error: 'timeout' }` after 15 seconds without retrying. Malformed matching replies resolve with `invalid-response`; port setup or posting failures resolve with `disconnected`. Each settled save removes its response listener and clears its timer.

There is no capability or version negotiation. EW versions without these actions ignore comparison messages; unacknowledged saves time out. The SDK initializes only from a message with `ready: true` and a transferred MessagePort, and subsequent messages do not replace that port. Action presence alone does not establish host support because the SDK and EW can deploy independently.
