# Auth and proxy

Two server-side pieces sit between the browser and the vendor: **da-etc** resolves credentials, **da-translate** forwards calls. Read this before steps 5 and 6.

## Request flow

```
browser (nx/blocks/loc/connectors/<name>)
  │  Authorization: Bearer <IMS token>           ← reserved for IMS, always
  │  x-translate-env: prod|stage                 ← archetype B
  │  x-<name>-authorization / x-<name>-origin    ← archetype A
  ▼
da-translate  POST ${DA_TRANSLATE}/translate/<name>/<org>/<site>/<vendor path>
  │  isAuthorized(IMS)  → resolveServiceKey (B) → da-etc /<org>/sites/<site>/integrations/<name>/login?env=
  ▼
vendor API (fixed origin, or origin validated against an env allowlist)
```

da-etc reads `.da/translate.json` in the site (via the Experience Workspace admin API, using the caller's IMS token), merges the optional credential sheet at `translation.service.key.path`, and picks the keys for the requested env (`translation.service.<env>.<prop>`). Credentials in the credential sheet stay out of the editable config.

## Choose an archetype

| | A: Token exchange (GlobalLink pattern) | B: Static API key (Lilt/DeepL pattern, **default for static keys**) |
|---|---|---|
| Vendor auth | OAuth client credentials / password grant / session token | One long-lived key |
| da-etc | `fetchXToken` returns the token to the browser (`/login`) | `fetchXToken` returns `{ access_token: key }`; browser only calls boolean `/status` |
| Browser holds | Short-lived vendor token (sessionStorage, 5-min refresh buffer) | Nothing secret |
| da-translate | Forwards `x-<name>-authorization` as upstream `Authorization`; validates `x-<name>-origin` against an env allowlist when the vendor host is per-tenant | Calls da-etc `resolveServiceKey`, injects the key; upstream origin fixed |
| da-nx `auth.js` | `getAccessToken(name, service)` and `fetchWithRetry`'s `onUnauthorized` | `checkConnection(name, org, site, env)` and `x-translate-env` header |
| Use when | Vendor tokens expire and are OAuth | Key never expires |

DeepL (PR #746) still ships the key to the browser via da-etc `/login`. It was written before the Lilt pattern and is superseded by archetype B: don't copy it.

`checkConnection` in `nx/blocks/loc/utils/auth.js` landed with the Lilt PR (#789). If it's not on `main` when you start, branch from that PR or wait; don't re-implement it.

A hybrid is fine: per-tenant origin (A's allowlist) plus a static key (B), for example. Keep the rule: **the browser never holds a long-lived secret**.

## da-etc (`da-sites/da-etc`, `src/routes/ints.js`)

1. Add `fetchXToken(service)` returning `{ json, status }` or `{ error, status }`. `service` is the resolved env creds (camelCase keys from the config rows).
   - Validate required fields with the `missingConfigError('Name', { a, b })` helper if present on `main` (error text names each missing key; it landed in `improve-token-fetcher-missing-config-errors`); otherwise inline a clear message.
   - Archetype A: exchange against the vendor token endpoint; return the vendor's response as-is if its shape differs (Smartling does).
   - Archetype B: `return { json: { access_token: apiKey }, status: 200 }`.
   - Return `{ error: 'Could not get token', status: resp.status }` on a non-OK vendor response. Don't echo vendor bodies (may contain secrets).
2. Register: `TOKEN_FETCHERS[name] = fetchXToken`. Archetype B also: `STATIC_KEY_SERVICES.add(name)`, which enables the `status` action that returns `{ connected }` and never the key. Don't add OAuth services to this set: `status` would trigger real token exchanges.
3. Tests in `test/routes/<name>.test.js` (mocha, `node:assert/strict`): success, each missing field, non-OK vendor response, and for B no network call.
4. README: add the service to the list of supported services and example endpoints.
5. Run `npm test` and `npm run lint`.

Endpoints (no new routing needed; `src/handlers/{post,get}.js` already dispatch to `intRoute`):
- `POST /:org/sites/:site/integrations/:name/login?env=` (secret-bearing; POST only)
- `GET|POST /:org/sites/:site/integrations/:name/status?env=` → `{ connected: boolean }`

## da-translate (`adobe/da-translate`, private)

1. `src/services/<name>.js`: default export `init(req, pathname, search, env, org, site)`. Strip the `/<name>` prefix. Return `{ body, headers, status }` or `{ status, headers: { 'x-error': '…' } }`. Templates: [B](../assets/da-translate-service-key.js.tmpl), [A](../assets/da-translate-service-token.js.tmpl), [wiring](../assets/da-translate-wiring.md.tmpl).
2. `src/handlers/postHandler.js`: import it, add `if (path.startsWith('/<name>/')) return <name>(req, path, search, env, org, site);` in `routeToService`, and add `'<name>'` to the `needsImsAuth` list. Skipping the last one leaves the route open without IMS auth.
3. Use the helpers:
   - `utils/forwardHeaders.js` `buildForwardHeaders(req.headers, extra)`: allowlist of `accept`, `content-type`, `content-length`. Cookies and other client headers never go upstream.
   - `utils/timeouts.js`: `AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)`; map timeouts to 504 with `x-error` (`isTimeoutError`).
   - `utils/serviceEnv.js` `getServiceEnv(req)`: `x-translate-env`, `prod` or `stage` only; reject others with 400.
   - `utils/resolveServiceKey.js` (archetype B): per-token-hash cache with 5-minute TTL; 403 on da-etc 401/403, 502 otherwise.
4. Rules:
   - Never forward the IMS `Authorization` upstream.
   - Per-tenant vendor origins come in `x-<name>-origin` and **must** be validated against `env.<NAME>_ALLOWED_ORIGINS` (comma-separated, scheme+host). Otherwise the endpoint is an open proxy. Add the env var to `wrangler.toml` (ask before editing; the file may carry local changes).
   - If the key must go in a query string, set it with `url.searchParams.set` after copying the caller's search, and never log the URL or `search`.
   - Don't log request bodies or headers.
   - Binary and large bodies stream through `req.body`; the response is read with `resp.blob()`.
5. Tests in `test/services/<name>.test.js` (mocha, chai, esmock; mirror `lilt.test.js`): routing through `postHandler`, header allowlist (cookie dropped, IMS not forwarded), missing/invalid headers, 403 on disallowed origin (A), key resolution params and failure statuses (B), timeout → 504, env validation.
6. `npm test` and `npm run lint`. The repo may be on another feature branch with a dirty `wrangler.toml`; use a worktree on a `feat/<name>-connector` branch off the base the user chose and leave unrelated changes alone.

## da-nx (`nx/blocks/loc/connectors/<name>/auth.js`)

Keep proxy plumbing in one small module ([B](../assets/connector-auth-key.js.tmpl), [A](../assets/connector-auth-token.js.tmpl); see `connectors/lilt/auth.js` and `connectors/globallink/index.js` header section):

- `resolveOrigin(service)` → `${DA_TRANSLATE}/translate/<name>/${org}/${site}` (null if org/site unknown). `DA_TRANSLATE` comes from `nx2/utils/utils.js`.
- `authHeaders(service, extra)` → `{ ...(await imsAuthHeader()), 'x-translate-env': env, ...extra }` (B) or plus `x-<name>-authorization` / `x-<name>-origin` (A).
- `retryConfig(service, opts)` → `fetchWithRetry` config; A supplies `onUnauthorized` that refreshes via `getAccessToken(name, service, { force: true })` and returns replacement opts; B returns `{}` because there's nothing for the browser to refresh.
- `isConnected(service)`: A: `authReady(name, service)` and an IMS token; B: `checkConnection(...)` and an IMS token.

Env defaults to `prod`. The service `env` flows from `translation.service.all.env`.
