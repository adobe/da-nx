# Running AO locally for the DA demo

This is the minimal, reproducible recipe to bring up Agent Orchestrator (AO)
locally so the browser AO client (`ao-client.js`) can talk to it.

## Prerequisites

- The `platform/ao` repo cloned at `~/Projects/platform/ao`.
- A populated `~/Projects/platform/ao/.env` (Artifactory creds, Azure/Bedrock
  keys, etc. — from the AO team).
- `uv` installed (AO's Python package manager).

## One-time manifest fixes

These edits make AO start without external GitHub access and load the DA plugin.

1. **Disable GitHub-backed marketplaces** (they hang on clone without network
   access and are not needed for the DA demo). In each of these manifests set
   `known_marketplaces: []`:
   - `.ao/manifests/aep-aia/default.yaml`
   - `.ao/manifests/aep-aia/genstudio-aia.yaml`
   - `.ao/manifests/aep-aia/da-local.yaml`

2. **DA plugin** is declared in `.ao/manifests/aep-aia/da-local.yaml` as a local
   path source pointing at `~/Projects/DA/da-agent/ao-plugin` (no network needed):
   ```yaml
   plugins:
     sources:
       - name: da-content
         source: /Users/<you>/Projects/DA/da-agent/ao-plugin
   ```

3. Each skill in `da-agent/ao-plugin/a2a/da-content-agent.yaml` must declare a
   `tags:` array (AO's `AgentCard` validation requires it).

## Start AO

Run from `~/Projects/platform/ao`:

```bash
set -a && source .env && set +a
AGENT_MANIFEST=da-local \
AGENT_STORAGE_BACKEND=memory \
AGENT_API_PORT=64053 \
AGENT_TOKEN_VALIDATION_ENABLED=false \
  uv run uvicorn agent_platform.apps.a2a.main:create_app --factory --port 64053 --host 0.0.0.0
```

Key environment variables:

| Var | Value | Why |
|-----|-------|-----|
| `AGENT_MANIFEST` | `da-local` | Load the DA PoC manifest (not the default AEP one). |
| `AGENT_STORAGE_BACKEND` | `memory` | In-memory sessions; no DynamoDB/Cosmos needed. |
| `AGENT_API_PORT` | `64053` | Avoid 8080 (often busy) and 3000 (da.live). |
| `AGENT_TOKEN_VALIDATION_ENABLED` | `false` | Accept `x-user-id`/`x-tenant-id` headers instead of validating real IMS tokens. |

> Do **not** pass `--reload` to uvicorn. The plugin cache writes under `.ao/`
> trigger WatchFiles into a reload loop and the server never stays up.

Wait for `Uvicorn running on http://0.0.0.0:64053`, then verify:

```bash
curl -s http://localhost:64053/health
# {"status":"healthy", ...}
```

## Verify streaming (no token, header auth)

```bash
curl -N -X POST http://localhost:64053/a2a/rpc \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -H 'x-user-id: demo-user' \
  -H 'x-tenant-id: demo-org@AdobeOrg' \
  -d '{"jsonrpc":"2.0","id":"t1","method":"message/stream","params":{"message":{"messageId":"m1","role":"user","parts":[{"kind":"text","text":"Say hello in 5 words."}],"contextId":"demo-1"},"configuration":{"acceptedOutputModes":["text"],"blocking":false}}}'
```

You should see `artifact-update` events streaming text, then a terminal
`status-update` with `final: true, state: completed`.

> **Gotcha:** do *not* include the `ims-identity` A2A extension (or it) when there
> is no real token — AO closes the connection (`terminated`). The browser client
> only attaches that extension when a token is present.

## Point the browser at local AO

Load da-nx with `ref=local` in the URL. With the AO harness toggle on (the
Skills Editor harness pill, or `localStorage['da-harness'] = 'ao'`), the chat
controller routes through `ao-client.js` to `http://localhost:64053` directly —
the da-agent Worker is bypassed.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Startup hangs at `Syncing aia-extensions...` | GitHub marketplace clone, no network | Set `known_marketplaces: []` in the manifests above. |
| Server starts then immediately reloads forever | `--reload` watching `.ao/` plugin cache | Run uvicorn without `--reload`. |
| `Address already in use` | Port 8080/3000 taken | Use `AGENT_API_PORT=64053`. |
| `ValidationError ... skills.0.tags Field required` | Plugin agent card missing `tags` | Add `tags:` to each skill in `da-content-agent.yaml`. |
| Chat request returns `terminated` immediately | `ims-identity` extension sent without a valid token | Use header auth (no extension) in local dev; the client already does this when no token. |
| `unauthorized: Missing Authorization bearer token` | Token validation on | Start AO with `AGENT_TOKEN_VALIDATION_ENABLED=false`. |
