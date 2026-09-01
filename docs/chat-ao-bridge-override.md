# Connecting chat-ao to CMA via the claudebridge

This is a how-to for pointing the da-nx `chat-ao` client at **Claude Managed
Agents (CMA)** instead of Agent Orchestrator (AO / "CX Coworker"). It is meant
for other teams who want to try the CMA-backed agent.

## What talks to what

```
da-nx chat-ao ──WebSocket──▶ claudebridge ──HTTPS──▶ CMA
  (browser)                  (Ethos service)         (Claude Platform on AWS)
```

You never connect to CMA directly. The **bridge** is the only component that
holds the CMA API key and translates AO WebSocket frames ⇄ Managed Agents
session events. So "use CMA" means "point chat-ao's WebSocket at a running
bridge."

By default `chat-ao` connects to Agent Orchestrator, resolving the region from
your IMS profile (`resolveAoWsBase` in
[`nx2/blocks/chat-ao/utils/uploads.js`](../nx2/blocks/chat-ao/utils/uploads.js)).
The `?ao=` override below swaps that origin for the bridge.

## The deployed bridge

| | |
|---|---|
| WebSocket origin | `wss://aem-sites-claudebridge-dev-va6.adobe.io` |
| Cluster | Ethos112 stage, `va6` (us-east-1) |
| Network | **Adobe corp network / VPN only** — the host is a `corp.` Ethos ingress and is not reachable from the public internet |
| CMA target | workspace `Experience Workspace Dev (va6)`, agent `ew-dev`, environment `ew-dev`, region `us-east-1` |

There is a single Phase-1 deployment; everyone hits the same bridge and the
same CMA workspace/agent.

## Prerequisites

- On the **Adobe corp network or VPN** (required to reach the bridge host).
- Signed in with an IMS identity that the bridge accepts. The bridge validates
  the AUTH frame's IMS bearer token against IMS stage
  (`ims-na1-stg1.adobelogin.com`) unless token validation is disabled, so use a
  **stage** IMS login.
- A da-nx branch that includes the `?ao=` override (see below). Merge target is
  `main`.

## Connecting da-nx to the bridge

Add `ao=<bridge-origin>` to the chat URL. Use a da.live **view** that hosts the
chat panel — `canvas` (with a document path in the hash) or `edit`. Note there
is no `/browse` view on hosted da.live (it 404s). Example against the frescopa
test site, on a branch that has the override:

```
https://da.live/canvas?nxver=2&nx=<branch>&ao=wss%3A%2F%2Faem-sites-claudebridge-dev-va6.adobe.io#/exp-workspace/frescopa/index
```

- `ao` accepts a full `wss://…`/`https://…` URL or a bare host (bare defaults to
  `wss`). Remember to URL-encode it (`wss%3A%2F%2F…`).
- If the chat panel doesn't appear, add `&nx-chat-ao=true` to force the AO /
  coworker client (when the org/site has no `ew.coworker` flag).
- **WS-only:** the override only redirects the chat WebSocket. The REST control
  plane (episode list, history, attachment uploads) stays on Agent Orchestrator,
  because the bridge implements only the WebSocket data plane — it does **not**
  serve `/api/v1/episodes` etc. (pointing REST at the bridge would 404). So use
  **New session** to test: episode history/resume against the bridge isn't
  available until the bridge serves the REST control plane.

### Security: the origin is allowlisted

The AUTH frame carries your IMS bearer token, so an arbitrary `?ao=` host would
be a token-exfiltration vector. `resolveAoOverride` only honors origins whose
host is `localhost`, `127.0.0.1`, or ends in `.adobe.io` / `.adobe.net` /
`.corp.adobe.com`. Anything else is ignored and the client falls back to the
normal AO resolution.

## Local bridge alternative (for bridge devs)

To run the bridge yourself and point da-nx at `ws://localhost:8080`:

1. Get `ANTHROPIC_API_KEY` from the `dx_aem_apex` vault (see the bridge repo
   internal runbook) and export it.
2. From the `aem-sites-claudebridge` repo, `docker-compose up` (starts the
   bridge + a local DynamoDB and wires `WS_URL` back at itself). The default
   config already targets the `ew-dev` workspace/agent/environment.
3. Open da-nx with `&ao=ws://localhost:8080` (localhost is allowlisted and
   defaults to the insecure `ws`/`http` scheme).

## Verifying CMA is up

CMA reachability is independent of the bridge. With the CMA API key exported,
a read-only retrieve confirms the platform + the configured agent/environment:

```js
import { AnthropicAws } from "@anthropic-ai/aws-sdk";
const c = new AnthropicAws({
  apiKey: process.env.ANTHROPIC_API_KEY,
  awsRegion: "us-east-1",
  workspaceId: "wrkspc_01Bkq2kpTfKpAN6fDuU6pudp",
});
await c.beta.environments.retrieve("env_01DPoxcZrTY647yC9YHBZckq"); // -> ew-dev
await c.beta.agents.retrieve("agent_01PjYwPhm3oJmqRLEfbKtc2E");     // -> core toolset agent
```

Endpoint: `https://aws-external-anthropic.us-east-1.api.aws`.

To check the **bridge** itself (from the corp network):

```
curl https://aem-sites-claudebridge-dev-va6.adobe.io/health/ready
```

`/health/ready` also verifies the bridge's DynamoDB dependency; `/health/live`
only confirms the process is up.

## Known limitations (Phase 1)

- **Attachments** on `USER_INPUT` are stripped by the bridge.
- **Plan approval** (`plan_approval_request`) has no CMA analog; the bridge
  ignores a RESUME `plan-response`.
- The bridge is a single shared dev deployment against one workspace/agent —
  no per-tenant isolation yet.
