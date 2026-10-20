# Live API verification

Docs and schemas describe what the vendor intends. Only a live call shows what it does. Verify twice: once **before** writing code (probe), and once **after** (every connector function end-to-end).

## No assumptions

Every decision that depends on vendor behavior needs evidence. Use the first source that answers it:

1. A live response from the vendor's sandbox.
2. The vendor's schema (OpenAPI, Swagger, Postman) or developer documentation.
3. The user. Ask one question at a time.

If a decision rests on none of these, it is an assumption. Stop and ask. Typical decisions that need evidence: endpoint and method, auth header, request and response shape, enum and status values, which state means "done", pagination params, file-name and size limits, language-code format, whether a call is idempotent, what cancel does, and rate limits.

Record each decision and its evidence in the intake report's decision log. "The docs say so" needs a link. "I tried it" needs the call and the observed response.

## Credentials

Use sandbox credentials the user provides through their own shell environment or secret store. Never paste them into chat, commit them, or write them to a file in the repo. Redact tokens and keys in anything you record. Don't run calls that spend money or touch production data. Ask before any call that creates billable work.

## 1. Probe before coding (step 3)

For every row in the intake report's operation map, make one real call with `curl` or a throwaway script outside the repo:

| Check | What to record |
|---|---|
| Auth | Exact header and value format; token lifetime; behavior on a bad or expired credential (status code and body) |
| Each endpoint | Method, path, required and optional params, the real response body (trimmed), and the identifier it returns |
| Error shape | One deliberate failure per endpoint (bad id, missing field): status code and body format |
| Status values | Every state you can reach or observe; compare with the documented enum and note differences |
| Pagination | Request more rows than one page; confirm the param names the API honors and how the end of the list is signaled |
| Limits | File name rules, size caps, supported language codes (query the vendor's list; don't hardcode) |
| Lifecycle | Create → upload → start → status → download on one tiny file, noting any wait or readiness state between steps |
| Cancel and cleanup | What the vendor allows, and how to delete your test data |

Write down every place the live response differs from the docs. Those are the bugs mocks would have hidden (wrong pagination params that were silently ignored, undocumented statuses, mandatory custom fields).

Put the trimmed real responses in the connector's test fixtures so the mocks mirror reality.

## 2. Verify every function end-to-end (step 10)

After the connector, proxy and credential endpoint exist, exercise **each** exported connector function and **each** vendor call it makes against the live sandbox. Mocked tests passing does not count.

Start da-etc and da-translate locally (`wrangler dev`) or use stage, then drive the connector two ways:

1. **Function harness.** A throwaway script or browser console snippet (kept out of the commit) imports the connector and calls each function with realistic `conf`, `urls` and `langs`. This isolates failures to one function and lets you test error paths the UI can't reach.
2. **Real Translate UI.** Walk the full flow (see [test-site.md](test-site.md)) to confirm the host calls the functions the way your harness did.

Build a coverage table and keep it in the PR description's validation section:

| Function / vendor call | Exercised live | Happy path | Error path | Result observed |
|---|---|---|---|---|
| `isConnected` / `connect` | | | | |
| `sendAllLanguages` (each vendor call inside it) | | | | |
| `getStatusAll` (including pagination) | | | | |
| `saveItems` (including the download and any approve call) | | | | |
| `cancelTranslation` (if exported) | | | | |
| `serviceOptions` (if exported) | | | | |
| da-etc credential endpoint | | | | |
| da-translate proxy (header allowlist, timeout) | | | | |

Rules:

- A row with no live evidence is not done. Either run it, or tell the user which row you could not run and why (for example, the vendor has no sandbox cancel).
- Check the **result**, not just the status code: open the saved page in Experience Workspace, confirm `translate="no"` content is intact, and confirm the vendor's side shows the expected state.
- Test reload: rebuild the connector state from the persisted project JSON and call status and save again.
- Test the failure paths on purpose: bad credential, unsupported language code, more pages than one page of results, more than five pages, a vendor-side failure.
- If a live result contradicts the code or the tests, fix the code **and** add a test that captures the real behavior. Then re-run the live check.
- Clean up vendor-side test data afterward where the vendor allows it.
