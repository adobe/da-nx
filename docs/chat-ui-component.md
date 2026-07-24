# nx-chat

A self-contained, reusable chat block. Designed to be mounted by Browse and Edit views without either knowing about the other.

## How to mount

```js
const chat = document.createElement("nx-chat");
container.append(chat);

// Inject view-specific context and callbacks via properties
chat.context = { org, site, path, view }; // view: 'browse' | 'edit'
```

The component manages its own controller internally. No external wiring needed.

## Properties in

| Property   | Type      | Description                                                            |
| ---------- | --------- | ---------------------------------------------------------------------- |
| `messages` | `Array`   | Conversation history. Read-only from outside — controller owns writes. |
| `thinking` | `Boolean` | Agent is processing. Disables input.                                   |
| `context`  | `Object`  | Page context: `{ org, site, path, view }`. Required — set by the host view. `view` must be `browse` or `edit`. |

**Message shape:**

```js
{ role: 'user', content: string }
{ role: 'assistant', content: string }                      // chat text
{ role: 'assistant', content: [{ type: 'tool', ... }] }     // tool activity
```

There is no `role: 'tool'` message — tool activity lives as `type: 'tool'` parts
on `assistant` messages (each carries its own lifecycle `state`; see
[Tool parts & card states](#tool-parts--card-states)). The full client↔agent
approval contract is specified in [`approval-protocol.md`](./approval-protocol.md).

**Request body:** The controller POSTs `{ messages, pageContext, imsToken, room, sessionId }` to the agent. `sessionId` is a UUID scoped to the current conversation session — it resets when the user clears the chat. Selection context is embedded on individual user messages (see [Selection context](#selection-context)) rather than as a top-level request field.

## Methods

| Method | Description |
|---|---|
| `chat.addAttachment({ id, label, ...rest })` | Adds a pill above the textarea. `id` is required — duplicate ids are silently ignored. `label` is the display text. Any additional fields are forwarded to the agent as context alongside the next message. |
| `chat.clear()` | Clears conversation history and writes a fresh `sessionId` for the current room. The new session ID takes effect immediately for subsequent agent requests. |

**Current scope:** `addAttachment` supports simple content references — e.g. a block or element from the document editor. Binary file attachments (images, uploads) are not yet supported and will extend this same API when introduced.

**Pills display:** All attached pills are currently shown with vertical scroll capped at two rows. Collapsing overflow into a "+N more" control is pending UX mocks.

## Events in

Components that want to add pills without holding a direct reference to the chat element can dispatch on `document`:

| Event | `CHAT_EVENT` key | Detail | Description |
|---|---|---|---|
| `nx-add-to-chat` | `ADD_TO_CHAT` | `{ key?, id, label, ...contextFields }` | Adds or replaces a pill. If `key` is set, replaces any existing pill with the same key (use for selection-driven context that changes as the user moves focus). If `key` is omitted, appends a new pill regardless. Dispatching `{ key }` with no `id` removes the pill for that key. |
Context fields on the detail (`blockName`, `innerText`, `proseIndex`) are forwarded to the agent as selection context on the next message. See [Selection context](#selection-context).

**Setting a prompt programmatically:** Call `setPrompt(text, { autoSend? })` directly on the `nx-chat` element. Within DA Live, prefer dispatching `PANEL_EVENT.OPEN` (`nx2/utils/panel.js`) on `document` instead — this also ensures the chat panel is open before the prompt is set:

```js
document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'chat', options: { text, autoSend } } }));
```

The registered `'chat'` section's `onShow` reads `options.text`/`options.autoSend` and calls `setPrompt()` on the mounted `nx-chat` element — see the host page's `registerPanelSection('chat', { onShow })`.

**Extension iframe usage:** Extensions running in cross-origin iframes cannot dispatch document events directly. Use `actions.setPrompt(text)` or `actions.setPrompt(text, { autoSend: true })` from the DA SDK — the iframe protocol relays it to `PANEL_EVENT.OPEN` (`{ section: 'chat', options: { text, autoSend } }`) on the host document, which opens the panel and calls `setPrompt()` on the chat element. `actions.setPrompt` is available on the object resolved from `DA_SDK`.

## Selection context

Attached context items (canvas selections, browse file selections) are serialised onto the outgoing user message before being sent to the agent:

```js
{ role: 'user', content: string, selectionContext: [item, ...] }
```

### Item shapes

**Canvas block** — emitted by `canvas-chat-bridge.js`:

```js
{ proseIndex: number, blockName: string, innerText: string }
```

| Field | Description |
|---|---|
| `proseIndex` | Zero-based editor index from `data-block-index` |
| `blockName` | CSS class name of the block (e.g. `hero`, `columns`) |
| `innerText` | Text content of the block |

**Browse file** — emitted by `browse-chat-bridge.js`:

```js
{ blockName: string, innerText: 'Selected repository path: org/site/path' }
```

| Field | Description |
|---|---|
| `blockName` | Filename with extension (e.g. `about-us.html`) |
| `innerText` | `"Selected repository path: ${key}"` where `key` is the full `org/site/path` |

### Agent-side handling

`selectionContext` is stripped from messages before the model sees them. `formatSelectionContextForModel` on the agent expands each item into text prepended to the user message — using `blockName` as the item label, `innerText` as the body, and `proseIndex` as the editor index hint. Items with no recognised fields are shown as "Prose section (editor index: ?)".

> **Contract:** The item shapes above are the shared contract between da-nx (client) and da-agent (server). If da-agent changes how `formatSelectionContextForModel` parses item fields, the bridge files (`canvas-chat-bridge.js`, `browse-chat-bridge.js`) and the `sendMessage` filter/map in `chat-controller.js` must be updated to match.

## Agent stream contract

The controller consumes a server-sent event stream from `da-agent`. Each line is a JSON object with a `type` field. The UI depends on the following event types:

### Text events

| Type | Fields | Description |
|---|---|---|
| `text-delta` | `delta` / `textDelta` / `text` | Incremental text chunk — appended to streaming buffer |
| `text-end` | — | Flush streaming buffer as a committed assistant message |
| `finish-message` / `finish` | — | Stream complete |
| `error` | `errorText` / `error.message` | Stream-level failure — terminates the stream immediately. Distinct from `tool-result` with `output.error`, which is a tool-level failure and non-fatal (stream continues). |

### Tool events

This wire vocabulary is owned jointly by da-nx and da-agent — it is **not** the
AI SDK's format. The canonical spec (message shapes, lifecycle states, batching)
is [`approval-protocol.md`](./approval-protocol.md); this section is the client's
view.

| Type | Fields | Description |
|---|---|---|
| `tool-input-available` | `toolCallId`, `toolName`, `input` | Agent invoked a tool — the client creates an in-flight tool part. |
| `tool-approval-request` | `toolCallId` | The call is gated behind user approval. `toolName`/`input` are recovered from the earlier `tool-input-available` with the same `toolCallId`. |
| `tool-output-available` | `toolCallId`, `output` | Tool executed successfully. |
| `tool-output-error` | `toolCallId`, `errorText` | Tool failed. |

### Tool parts & card states

Each tool invocation is a single part — `{ type: 'tool', toolCallId, toolName,
input, state, output? }` — on an `assistant` message. The `state` is the single
key both the UI and the server reconcile on (never message position):

```
tool-input-available   → input-available    (in-flight)
tool-approval-request  → awaiting-approval   (or → approved if auto-approved)
(user approves)        → approved
(user rejects)         → rejected
tool-output-available  → output-available    (done)
tool-output-error      → output-error
```

`awaiting-approval` is the only state that requires user action. The tool card
renders every state except `awaiting-approval`, which the approval popover shows
instead.

### Batched approvals

When one agent step gates **multiple** tools, the client surfaces the approval
requests **as a queue, one at a time**. Each decision is recorded on its tool
part (`approved` / `rejected`) but **nothing is sent until the whole queue is
drained** — then the client sends **one** POST with the full history carrying all
decisions. The server executes the approved tools **sequentially**, streams a
`tool-output-available` / `tool-output-error` per tool, and continues the turn.
This batching is what makes multi-tool approvals correct — see
[`approval-protocol.md`](./approval-protocol.md) §6–§7.

### Tool event ordering guarantees

Per `toolCallId`, events arrive in order: `tool-input-available` first, then
optionally `tool-approval-request`, then a terminal `tool-output-available` /
`tool-output-error`. All tool state is keyed on `toolCallId`, so ordering across
different tools and message position do not matter.

> **Contract:** Event ordering per `toolCallId` is a stable contract with
> da-agent. Breaking changes require a coordinated update on both sides.

**Duplicates:** The client ignores a duplicate `tool-input-available` for a
known `toolCallId`.

**Interruptions:** If the stream drops, a tool part may be left `input-available`
or `awaiting-approval`. On reload, `migrateHistory` normalises persisted history
and drops mid-flight (unresolved) tool parts so no orphaned tool-call is sent on
the next request. (Accepted edge: a tool executed by the server right before an
interruption — before the client stored its result — can re-run on the next
send; see [`approval-protocol.md`](./approval-protocol.md) §12.)

**Reconnect:** The stream is a live feed — events are not replayed. A new stream
starts fresh.

The approval popover accepts keyboard shortcuts: `Esc` = Reject, `↵` = Approve,
`⌘↵` = Always approve.

**If the agent team adds or renames event types, `processEvent` in
`utils/stream.js` must be updated to match.**

### Approval summary rendering

The UI picks one field from `input` to display as a human-readable summary beneath the tool name. Priority order:

1. `humanReadableSummary` — preferred; plain-language description of what changed (used by `content_update`)
2. `sourcePath` + `destinationPath` — rendered as `sourcePath → destinationPath` (used by `content_move`)
3. `path` — file path being created or deleted (used by `content_create`, `content_delete`)
4. `skillId` / `name` — identifier for skill/agent creation tools

`content` and other large payload fields are intentionally excluded — they are never shown to the user.

For new tools that require approval, prefer adding a `humanReadableSummary` field to the input schema rather than relying on the fallback chain above.

The tool `output` (from `tool-output-available`) is stored on the tool part but not currently rendered. If da-agent adds a `humanReadableSummary` to tool output, it would be the natural place to show a completion summary (e.g. "Created `/drafts/page.md` successfully").

### "Always approve" scope

When the user clicks "Always approve", the tool name is added to an in-memory `Set` on the controller, and every other still-queued approval for that same tool is drained to `approved` in the same batch. Subsequent `tool-approval-request` events for that tool arrive pre-approved (the part goes straight to `approved` instead of `awaiting-approval`). The set is **conversation-scoped** — it resets only on `clear()`. There is no path-scoping: "always approve" applies to the tool by name regardless of what path the agent acts on, since the path is in the tool input rather than the tool name. There is no cross-session persistence.

## Persistence

Conversation history is persisted in IndexedDB, keyed by `org--site--userId`. This means:

- History is **shared across all pages within a site** — navigating between paths does not start a new conversation.
- History is **user-specific** — different IMS users on the same site have separate histories.
- `clear()` resets the stored history for the current room and generates a new `sessionId` — the record is updated rather than deleted so the new session ID survives a reload.

### Sessions

Each conversation has a `sessionId` (UUID) stored in IndexedDB alongside its messages. The ID is shared across tabs on the same room and survives page reloads. A new ID is generated on first open (no stored record) or when the user calls `clear()`. The agent receives `sessionId` on POST so it can scope server-side state to the current session and combine traces to a session for telemetry.

**Not yet implemented:** multiple named sessions per room, session switching UI, and agent-emitted `session-title` events. When introduced, the session picker and create/rename/delete UI would live inside the chat component — the host has no role in session management.

## Events out

Event names are exported as `CHAT_EVENT` from `constants.js` — consumers (in da-nx or elsewhere, e.g. da-live's canvas) should import that constant rather than hardcoding the string.

| Event | `CHAT_EVENT` key | Bubbles | Detail | Description |
|---|---|---|---|---|
| `nx-agent-change` | `AGENT_CHANGE` | Yes | `{ scope: 'file' \| 'document', paths: string[] }` | The agent completed a tool action that changed content. `scope: 'file'` means the file tree changed (files created, deleted, moved, or copied); `scope: 'document'` means a document's content was modified. `paths` contains the affected parent folder paths. |
| `nx-highlight-selection` | `HIGHLIGHT_SELECTION` | No | `{ selFrom, selTo, selectionType, blockName, proseIndex }` | A pinned selection pill was activated (clicked) in the chat's context list. Tells the host editor to highlight/scroll to that selection in the document. |

## Skills slash menu

Typing `/` in the chat input opens a skill picker populated from the current site's skill library.

**Source:** `GET /config/{org}/{site}` → `json.skills.data` rows (same endpoint as prompts). This mirrors `da-agent/src/skills/loader.ts` exactly, so the menu only shows skills the agent can resolve.

**Rules (match the agent's `loadSkillsIndex`):**
- Site-level only — no org-level fallback.
- Rows with `status: 'draft'` are excluded.
- IDs are normalised: `.md` suffix stripped (`check-heading.md` → `check-heading`).

**Wire:** on selection, the skill ID is collected and passed as `requestedSkills: [id]` in the next POST to da-agent. The agent loads the full markdown content from its own config KV and injects it into the system prompt — the client never sends the content itself.

**Approval continuations:** `requestedSkills` is intentionally re-sent on approval continuation POSTs. The agent rebuilds its system prompt from scratch on every request, so the skill must be present in each POST that expects it to be in context. `requestedSkills` resets to `[]` only when the user sends the next fresh message.

## Boundaries

- **UI (`chat.js`)** — rendering only. No API calls, no auth, no view-specific logic.
- **Controller (`chat-controller.js`)** — agent communication, message state, persistence. No DOM access.
- **Host view** — mounts `<nx-chat>`, injects context and view-specific callbacks as properties. Never reaches into chat internals.

View-specific callbacks (e.g. document revert for Edit) are injected as properties on the controller — not as component properties. The view owns what to inject; chat owns how to use it.
