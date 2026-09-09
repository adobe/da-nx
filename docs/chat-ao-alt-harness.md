# Connecting chat-ao to CMA via the claudebridge (alt harness)

This is a how-to for pointing the da-nx `chat-ao` client at **Claude Managed
Agents (CMA)** instead of Agent Orchestrator (AO / "CX Coworker"). Routing is
gated by an **activation key** stored in site config, not a URL param.

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
When a valid `ew.altHarness` activation key is present, that origin is swapped
for the bridge (`CMA_BRIDGE_WS_BASE` in
[`nx2/blocks/chat-ao/ao-constants.js`](../nx2/blocks/chat-ao/ao-constants.js)).

## The activation key gate

Routing to the bridge is controlled by a **faux activation key** — a shared
secret string we hand out to testers, add to, or revoke, while the alt harness
is in testing. It is validated in two places:

- **Client:** the `ew.altHarness` value from the site's `flags` config sheet is
  read via `getEWFlags` in `chat-ao.js`. When set, the chat WebSocket routes to
  the bridge and the key is attached to the AUTH frame as `activationKey`.
- **Server:** the bridge holds an allowlist of valid keys (config
  `auth.activationKeys`, injected from vault). When the allowlist is non-empty
  it rejects any AUTH frame whose `activationKey` is missing or not on the list.

Both sides matter: the site-config key turns on the client routing, and the
bridge's server-side allowlist is what actually authorizes the connection. A
stale or removed key stops working the moment it leaves the bridge allowlist,
regardless of what a site config still says.

This client wiring lives **only on the `ewoncma` branch**, so `main` never
routes to the bridge even if a config sheet carries an `ew.altHarness` value.

## The deployed bridge

| | |
|---|---|
| WebSocket origin | `wss://aem-sites-claudebridge-va6.adobe.io` |
| Cluster | Ethos112 stage, `va6` (us-east-1) |
| Network | **Adobe corp network / VPN only** — the host is an Ethos ingress and is not reachable from the public internet |

## Prerequisites

- On the **Adobe corp network or VPN** (required to reach the bridge host).
- Signed in with an IMS identity that the bridge accepts. The bridge validates
  the AUTH frame's IMS bearer token and entitlement.
- A valid activation key present on the bridge allowlist **and** written to the
  test site's `ew.altHarness` config flag.
- A da-nx `ewoncma` build (the client routing lives only on that branch).

## Turning it on for a site

1. Get a key that is on the bridge's `auth.activationKeys` allowlist.
2. Add a row to the site's `flags` config sheet: key `ew.altHarness`, value =
   the activation key. Site-level config overrides org-level.
3. Open the chat on an `ewoncma` build against that site, e.g. frescopa:

```
https://da.live/canvas?nxver=2&nx=ewoncma&nx-chat-ao=true#/exp-workspace/frescopa/index
```

- `nx-chat-ao=true` selects the **chat-ao client** (the WebSocket/AO-protocol
  chat UI). It does **not** pick a backend — the `ew.altHarness` key does.
  Without a key, chat-ao connects to the real Agent Orchestrator; with one, to
  the bridge → CMA. Add `nx-chat-ao=true` when the org/site has no `ew.coworker`
  flag, otherwise the legacy chat client loads.
- **WS-only:** only the chat WebSocket is redirected. The REST control plane
  (episode list, history, attachment uploads) stays on Agent Orchestrator,
  because the bridge implements only the WebSocket data plane — it does **not**
  serve `/api/v1/episodes` etc. So use **New session** to test: episode
  history/resume against the bridge isn't available yet.

## Verifying the bridge

To check the **bridge** itself (from the corp network):

```
curl https://aem-sites-claudebridge-va6.adobe.io/health/ready
```

`/health/ready` also verifies the bridge's DynamoDB dependency; `/health/live`
only confirms the process is up.

## Known limitations

- **Attachments** on `USER_INPUT` are stripped by the bridge.
- **Plan approval** (`plan_approval_request`) has no CMA analog; the bridge
  ignores a RESUME `plan-response`.
- The bridge is a single shared deployment against one workspace/agent — no
  per-tenant isolation yet.
