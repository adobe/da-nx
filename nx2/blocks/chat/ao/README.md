# AO browser client (`ao-client.js`)

A dependency-free, framework-agnostic browser library that streams chat **directly
from the browser to Agent Orchestrator (AO)** over A2A (`message/stream`), with no
Cloudflare Worker in the request path.

```
Before:  browser → da-agent (CF Worker proxy) → AO
Now:     browser ───────────────────────────────→ AO
```

## Why this exists

The `da-agent` Cloudflare Worker was used as a proxy that translated between the
chat UI's stream format and AO. During integration we confirmed a hard limitation:

- AO streams a full token-by-token response when called **directly** (verified: a
  complete reply in ~3-4s).
- The same request routed **through the CF Worker** is killed by the Workers
  runtime with *"your Worker's code had hung and would never generate a response"*.

Removing the Worker from the path removes that failure mode entirely and cuts a
moving part. This library is the browser port of the Worker's `chat-adapter.ts`.

## What it does

1. Resolves IMS identity (`token`, `orgId`, `userId`).
2. POSTs an A2A JSON-RPC `message/stream` request to `AO/a2a/rpc`.
3. Translates AO's JSON-RPC SSE into the **Vercel AI SDK UIMessageStream** event
   format (`text-delta`, `text-end`, `finish-message`, `[DONE]`) that the chat
   UI's existing `readStream()` already consumes — so nothing downstream changes.

AO is **stateful**: it stores conversation history keyed by `contextId`. Only the
newest user message is sent per turn — never the full transcript.

## Usage

```js
import { createAOClient, resolveImsIdentity } from './ao/ao-client.js';
import { readStream } from './utils/stream.js';

const client = createAOClient({
  backendUrl: 'https://ao.adobe.io',            // or http://localhost:64053 in dev
  getIdentity: () => resolveImsIdentity(window.adobeIMS),
});

const resp = await client.streamChat({
  message: 'Create a hero block on the home page',
  contextId: sessionId,                          // reuse the same id across turns
  signal: abortController.signal,
});

await readStream(resp.body, {
  onDelta: (text) => render(text),               // streaming partial text
  onText: (text) => commit(text),                // final assistant message
  onTool: (evt) => handleTool(evt),
});
```

`streamChat()` returns a fetch-`Response`-like object (`{ ok, status, body }`)
whose `body` is a `ReadableStream<Uint8Array>` of SSE bytes, so it is a drop-in
replacement for `fetch(...)` in the chat controller.

## Identity: token vs. headers

AO accepts identity two ways:

| Mode | When | What the library sends |
|------|------|------------------------|
| **Token (prod)** | a real IMS token is available | `Authorization: Bearer <token>` **plus** the `ims-identity` A2A extension carrying `imsOrgId` / `imsUserId` |
| **Headers (local dev)** | no token (AO started with `AGENT_TOKEN_VALIDATION_ENABLED=false`) | `x-user-id`, `x-tenant-id`, `x-gw-ims-org-id` headers only |

> **Important:** the `ims-identity` extension is only attached when a token is
> present. With token validation disabled and no token, attaching the extension
> makes AO try to validate against IMS and it closes the connection instantly
> (`terminated`). The header path is the supported local-dev flow.

The IMS access token does **not** reliably carry the org id. Prefer resolving the
org from imslib's profile (`resolveImsIdentity` does this) and only fall back to
decoding it from the token (`decodeImsOrgId`).

## Exports

| Export | Purpose |
|--------|---------|
| `createAOClient({ backendUrl, getIdentity })` | Build a client; returns `{ streamChat }`. |
| `resolveImsIdentity(adobeIMS)` | Resolve `{ token, orgId, userId }` from a `window.adobeIMS` instance. |
| `decodeImsOrgId(token)` | Best-effort org id from a JWT payload. |
| `decodeImsUserId(token)` | User id from a JWT payload. |

## AO event mapping

| AO A2A event | UIMessageStream output |
|--------------|------------------------|
| `artifact-update` part `kind: text` | `text-delta` |
| `artifact-update` part `kind: data` (title/usage/text-done) | ignored |
| `status-update` `final: true`, `state: completed` | `text-end` + `finish-message` + `[DONE]` |
| `status-update` `final: true`, `state: failed` | surfaced as text, then finalized |
| `task` (final, non-streaming) | collected text, then finalized |
| JSON-RPC `error` | surfaced as text, then finalized |
| socket close | finalized |

## Browser streaming note

The AO→UI translation reads AO's stream from a `ReadableStream` `start()` loop,
not `pull()`. Chrome does **not** reliably re-invoke `pull()` when a pull resolves
without enqueuing anything — which happens for every AO non-text event
(`status-update`, `episode-title-updated`, `usage-update`). A `pull()`-based
reader works in Node but stalls in the browser after the first couple of
non-text events. The `start()` loop reads AO continuously and only enqueues the
translated text events. (Verified end-to-end in headless Chrome.)

## Local development

The library targets `http://localhost:64053` when the page URL has `ref=local`,
otherwise `https://ao.adobe.io`. See [`SETUP.md`](./SETUP.md) for how to run AO
locally for the demo.
