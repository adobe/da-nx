# Connector contract

The host is `nx/blocks/loc/views/translate/{translate.js,index.js}`. Connectors are loaded by `setupConnector` with `import(\`../../connectors/${name}/index.js\`)` where `name = service.name.toLowerCase().replaceAll(' ', '-')`. Options view (`views/options/options.js`) loads the same module for `serviceOptions`.

The public description is the aem.live page. This file is the precise version taken from the host code and the shipped connectors. When they disagree, the host code wins. Read `views/translate/translate.js` and `views/translate/index.js` if anything below looks stale.

## Exports

| Export | Required | Signature | Host call site |
|---|---|---|---|
| `isConnected` | yes | `(service) => Promise<boolean>` | On mount; gates the Send button |
| `connect` | yes | `(service, sendMessage?) => Promise<boolean>` | Connect button; also Options view before `serviceOptions[].fetch` |
| `sendAllLanguages` | yes | `({ title, service, options, langs, urls, actions, org, site, snapshot, langsWithUrls }) => Promise<void>` | Send; also once per dependent language |
| `getStatusAll` | yes | `({ service, langs, urls, actions, … }) => Promise<void>` | Status refresh / polling |
| `saveItems` | yes | `({ org, site, service, lang, langIndex, urls, saveFn, sendMessage }) => Promise<Object[]>` | For each lang with status `translated` |
| `dnt` | yes | `{ addDnt }` imported from `../../dnt/dnt.js` | Source fetch (`getUrls`); omitting it throws before anything is sent |
| `cancelTranslation` | no | `({ service, lang, sendMessage }) => Promise<{ ok: boolean, skipped?: boolean }>` | Cancel buttons; the UI hides them if the export is absent |
| `serviceOptions` | no | `[{ key, label, fetch(service) => Promise<{value,label}[]> }]` | Options view dropdowns |

`actions` is `{ saveState, sendMessage }`. `saveState({ options, urls })` persists project state; both args optional. `sendMessage({ text, type })` shows one message; `type: 'error'` is an error; `sendMessage()` clears it.

## Inputs

**`service`** is the active environment's config: `name`, `env`, `org`, `site`, `connector` (the module itself), plus one property per `translation.service.<env>.<prop>` key. In the Translate view it is the **same object** as `options.service`, so properties you assign persist on `saveState({ options })`. In the Options view (`serviceOptions[].fetch`, `connect`) it is a throwaway copy. Values read from the config sheet are `{ value }` objects; values chosen from a `serviceOptions` dropdown are plain strings. Connector-written state follows the `{ value }` convention. Read both shapes through one helper (`typeof v === 'object' ? v?.value : v`).

**`options`** is the project options sheet, including `options['source.language']` (`{ code, name, location }`) and `options.service`.

**`langs`** are target languages for this call: `{ code, name, location, translation?, waitingFor?, source? }`. Dependent languages (`waitingFor`) are held back, then sent later as separate jobs with `options['source.language']` overridden, so `langs` can span several jobs across calls. Treat `lang.translation` as possibly `undefined`: `lang.translation ??= {}` before writing. Dependent languages are the exception: the host pre-creates `translation: { status: 'not started' }` and deletes `waitingFor` before calling you. If the submission fails and you send an error message, the host reverts the language to `waiting` so the next status check retries (a thrown error is also caught and reported). `conf.langsWithUrls` is not refreshed for that call. Make `getStatusAll` skip entries that have no vendor id.

**`urls`** are source pages: `{ daBasePath, daDestPath, ext, hasExt, content, suppliedPath, aemHref, … }`. `content` is already DNT-wrapped HTML (or JSON text when the path contains `.json`). Per-language alternate sources live in `langsWithUrls`; most connectors ignore them because the host passes the right `urls` for each call.

## State and persistence

| Level | Where | How to persist |
|---|---|---|
| Per project/job | `options.service.<key> = { value: String }` (equivalently `service.<key>` in the Translate view) | `await actions.saveState({ options })`. Serialize objects with `JSON.stringify`; parse defensively on read, falling back to `{}`. Read as `service.<key>?.value`. |
| Per language | `lang.translation` (`status`, `sent`, `translated`, `saved`, vendor ids) | Mutate in place; `saveState()` serializes `langs`. |
| Per url per language | `url.requestIds[lang.code]` | `saveState({ options, urls: cleanUrls })`. The host merges by path via `mergeUrls`. Strip `content`/`sourceContent` first. |

Why `{ value }`: config sheet rows are wrapped, and connector state mirrors that shape. A Lilt bug read the raw object where a string was expected; always unwrap on read.

Persist enough to resume after a browser reload: job/submission ids, per-file ids (`daBasePath → id`), and any per-language ids. If the vendor splits one upload across multiple submissions (GlobalLink), persist `submissionIds` and a `documentIds` map for each.

## Status vocabulary

`lang.translation.status` takes exactly these values. The UI renders a pill for each; add a pill and CSS entry if you invent a new one (try not to).

| Status | Meaning | Set by |
|---|---|---|
| `not started` | Initial | Host |
| `waiting` | Dependent on another language | Host |
| `created` | Sent to vendor; no work reported yet | `sendAllLanguages` |
| `in progress` | Vendor reports partial progress | `getStatusAll` |
| `translated` | Vendor finished; host will call `saveItems` | `getStatusAll` |
| `complete` | All urls saved to Experience Workspace | Host, after `saveItems` returns `savedCount === urls.length` |
| `error` | Needs attention | Connector, host |
| `cancelling` | Transient during cancel | Host |
| `cancelled` | Cancel confirmed. **Two l's.** | `cancelTranslation` / `getStatusAll` |

`utils/steps.js` treats only `complete` and `cancelled` as terminal. Anything else (including the one-l `canceled`) keeps the project open.

Counts (`lang.translation.sent`, `.translated`, `.saved`) drive the progress text. Set `sent = urls.length` on send and `translated` from the vendor's per-file or per-language counts.

## Behavioral rules

**`isConnected`** must be cheap and side-effect free; the host calls it often. `connect` establishes the connection and reports failure via `sendMessage({ text, type: 'error' })`.

**`sendAllLanguages`**
1. Call `isConnected`; if false, `sendMessage` error and return.
2. Take the source language from `options['source.language']?.code`; `source.language` is optional, so fall back to `en-US` only when it is absent (as Lilt, Lionbridge, GlobalLink and Trados do) and never read `.code` unguarded. Language-code mapping to vendor codes goes in one function. If the vendor has a languages endpoint, check the source and target codes against it before submitting and `sendMessage` one error naming the unsupported codes; skip the check if the lookup itself fails.
3. Upload sources; on any failure, `sendMessage({ type: 'error' })` **once** (roll up per-file errors) and return without touching `lang.translation`, so the user can retry.
4. Create/submit the project. Only after the vendor returns a valid id for a language, set that language's `translation.status = 'created'` and `sent = urls.length`. If creation fails or returns no id, do not create `lang.translation` for it (and persist no ids): the object is what enables "Get Status", so a failed submission must not be pollable. Per-document vendors with no project id (DeepL) may instead create `lang.translation` and the `documents` map before uploading, then set `status: 'error'` when some documents failed, so Get Status can poll the accepted ones.
5. Persist ids with `saveState({ options })` (and `urls` if per-url ids).
6. Return. **Do not poll for completion here.** The host does not call `getStatusAll` after `sendAllLanguages`. It only saves languages already marked `translated` or `complete`, and `getStatusAll` runs when the user clicks Get status (or after a cancel). Async vendors set `created` and let `getStatusAll` advance it. Instant-MT vendors whose result is ready on return set `translated` (plus whatever `saveItems` needs to fetch it), as the Google connector does.

**`getStatusAll`**
- Filter to languages not in `['complete', 'cancelled']`. Return early if none.
- Group languages by their own job/submission id; don't assume one job per call.
- Paginate. Use the vendor's actual pagination params.
- Map vendor states to the table above. Unknown vendor state: leave status unchanged, don't invent `error`. A definitive vendor failure maps to `error` with a message.
- Call `saveState()` at the end.

**`saveItems`**
- Download each url's translated output with `downloadQueue(urls, cb)`, max five concurrent (default).
- In the callback: fetch, `url.sourceContent = await removeDnt({ org, site, html, ext: url.ext })`, then `await saveFn(url)`. `saveFn` writes to Experience Workspace and sets `url.status = 'success'`; it does not throw on failure, so check `url.status === 'success'` afterwards. On a failed download set `url.status = 'error'`; `downloadQueue` resolves only when every url has a truthy status.
- Return the same `urls` array. The host counts `status === 'success'`.
- Only after confirmed saves, call the vendor's approve/mark-delivered endpoint, and surface failures from it.
- Find outputs by stored id or exact normalized name, never by substring.

**`cancelTranslation`**
- Only export it if the vendor allows connector-initiated cancel. Lionbridge forbids it, so its connector deliberately has none.
- Cancel the narrowest scope: this language, not the whole shared job (Smartling removes the locale from the job).
- On success set `lang.translation.status = 'cancelled'` and return `{ ok: true }`. If the vendor accepts but finalizes later, set `lang.translation.cancelPending = true` and return `{ ok: true }`; `getStatusAll` then confirms. If the vendor rejects, return `{ ok: false }`. The host restores the previous status. If the language is already done, `{ ok: true, skipped: true }`.

**`serviceOptions`** items render as dropdowns in the Options step. The host calls `connect(service)` first, then every `fetch`, seeds the first choice if the key is unset, and stores the choice under `translation.service.<env>.<key>`. Static lists (Lilt's AI vs Verified) render even when nothing is configured.

## Config keys

Admins set these in `.da/translate.json` (`translation.service.*`). Document every key the connector reads in the docs step.

- `translation.service.name`, `translation.service.all.env` (usually `stage, prod`)
- `translation.service.<env>.<key>`: connector-specific (endpoint, client id, project, mode)
- `translation.service.key.path`: path to a credential sheet (read server-side by da-etc)
- `translation.service.supports.duedate`: true shows a due-date field
- `translation.service.custom.<type>.<name>`: custom attributes (for example GlobalLink)

## Error handling

- Network helpers return `{ error, status }` or `{ json }`. Don't throw for expected failures.
- `fetchWithRetry` (`utils/fetchWithRetry.js`): `maxRetries` 5, backoff with jitter, honors `Retry-After`, retries 429 and 5xx, can retry once on 401 via `onUnauthorized`. Guard `onUnauthorized` against a missing auth context. Override `isRetryable` only when the vendor documents it (Lionbridge: 429 and 503).
- Include the vendor's error message in `sendMessage` text. "Upload failed" alone is not enough.
