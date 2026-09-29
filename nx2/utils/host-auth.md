# `nx2/utils/host-auth.js` — Host-supplied authentication

Detects whether the current page is running embedded inside a host frame
(e.g. da.live's app shell) that can share an already-authenticated IMS
access token, so the embedded page never has to bootstrap its own
standalone IMS session. This is the nx2-native replacement for nx1's
`DA_SDK` (`nx/utils/sdk.js`) — not a 1:1 port of its API surface, but a
first-class input path that `nx2/utils/api.js`'s `daFetch` consults before
falling back to `nx2/utils/ims.js`'s standalone bootstrap.

Type definitions live in `[host-auth.d.ts](./host-auth.d.ts)`.

---

## Protocol

The host and the embedded page speak a small postMessage handshake:

1. On load, the host `postMessage`s `{ ready: true, token, context }` to
   the iframe's `window`, transferring a `MessagePort` alongside it.
2. `host-auth.js` listens on `window` for exactly that shape (`ready` +
   at least one transferred port) and ignores everything else — this is
   how it safely coexists with unrelated `message` events from devtools,
   browser extensions, analytics, etc.
3. Once the handshake message arrives, the `window` listener is torn down
   and all further communication happens over the dedicated port instead
   (e.g. the host pushing a refreshed token after re-authenticating).
4. If no handshake message arrives within the timeout, the page is
   treated as standalone (not embedded) and `getAccessToken()` /
   `getHostContext()` resolve `undefined` — callers fall back to their
   own auth (`daFetch` falls back to `ims.js`'s `loadIms()`).

See `nx/blocks/shell/shell.js` for the current in-repo host-side
implementation of this protocol, and `nx/utils/sdk.js` for its nx1
`DA_SDK` origin.

**Why not nx1's `DA_SDK` global listener?** `nx/utils/sdk.js` keeps a
single, permanent, unscoped `window.addEventListener('message', ...)`
handler for the lifetime of the page — every message after the handshake
is funneled through it, with no correlation between a given call and its
response. That's a hazard for anything two-way (e.g. its `getSelection()`,
where two near-simultaneous callers can have their responses
cross-delivered). `host-auth.js` avoids this by switching to the
handshake's own `MessagePort` immediately after adoption and removing the
`window` listener entirely, so there's nothing left to race.

## API

```js
import { initHostAuth, getHostContext, getAccessToken, setHash } from '/nx2/utils/host-auth.js';
```

- **`initHostAuth()`** — Runs (or joins, if already running/complete) the
  handshake. Resolves `{ isEmbedded: boolean }`. Every other export calls
  this internally, so most callers never need to call it directly.
- **`getHostContext()`** — Resolves the context object the host supplied
  (e.g. `view`, `org`, `repo`, `ref`, `path`), or `undefined` when
  standalone.
- **`getAccessToken()`** — Resolves `{ token }` supplied by the host, or
  `undefined` when standalone (or if the host hasn't sent one yet).
- **`setHash(hash)`** — Asks the host to update its address bar's location
  hash. No-op (does not throw) when standalone. The one nx1 `DA_SDK`
  action carried forward, because it has a proven nx2 need. Other nx1
  actions (`sendText`, `sendHTML`, `closeLibrary`, `getSelection`,
  `setPrompt`, `showPanel`) are intentionally **not** implemented — add
  them only when a real nx2 consumer needs them.

## Lifecycle

The handshake is single-flight and memoized: the first call to
`initHostAuth()` (directly, or via any other export) starts it; every
subsequent call — concurrent or not — shares that same promise. There is
no reset/re-init API; this mirrors the memoization pattern already used
by `nx2/utils/ims.js`'s `loadIms()` and `nx2/utils/utils.js`.

If the host later sends an updated token (over the port, post-handshake),
internal state is updated in place — the already-resolved outer
`initHostAuth()` promise is not replaced, so callers who already awaited
it and hold onto `getAccessToken()`'s return simply call it again to read
the fresh value.

## Usage in `daFetch`

`nx2/utils/api.js`'s `daFetch` calls `getAccessToken()` first; only when
it resolves `undefined` (no host, or host hasn't supplied a token) does
it fall back to `ims.js`'s `loadIms()`. Everything downstream of that
point (request headers, permission parsing, etc.) is unchanged — swapping
the token source has zero effect on the rest of `daFetch`.

## Testing

Tests live in `[host-auth.test.js](../test/unit/nx/utils/host-auth.test.js)`.
Because the module memoizes its handshake with no reset API, tests import
it with a cache-busting query string (e.g. `host-auth.js?fresh=1`) to get
an isolated module instance per test, and simulate the host side with a
real `MessageChannel` + `window.postMessage`.

`daFetch`'s host-token-first / `ims.js`-fallback behavior is covered in
`[utils.test.js](../test/unit/nx/utils/utils.test.js)`, mocked the same
way `ims.js` already is — via the import map in
`[wtr.config.mjs](../test/wtr.config.mjs)`
(`/nx2/utils/host-auth.js` → `/nx2/test/mocks/host-auth.js`).
