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
{ role: 'user', content: string, selectionContext?: [...], attachmentsMeta?: [...] }
{ role: 'assistant', content: string }
{ role: 'tool', ... }  // filtered from display automatically
```

`attachmentsMeta` items: `{ id, fileName, mediaType, sizeBytes? }` — base64 data is stripped before storing.

**Request body:** The controller POSTs `{ messages, pageContext, imsToken, room, attachments? }` to the agent. Selection context is embedded on individual user messages (see [Selection context](#selection-context)) rather than as a top-level request field.

`attachments` items: `{ id, fileName, mediaType, dataBase64, sizeBytes? }`. Present when the user attached files to the message. Re-sent on approval continuation POSTs for the same turn so the agent retains file context across approval rounds; omitted on turns with no attachments.

> **Contract:** `attachments` is consumed by da-agent to make file content available to the model. The agent stores attachments in a per-request map keyed by `id`; the model calls `content_upload(attachmentRef)` to persist a file to DA storage.

## Methods

| Method | Description |
|---|---|
| `chat.addAttachment({ id, label, ...rest })` | Adds a pill above the textarea. `id` is required — duplicate ids are silently ignored. `label` is the display text. Any additional fields are forwarded to the agent as selection context alongside the next message. |
| `chat.clear()` | Clears conversation history and resets IndexedDB for the current room. |

**Pills display:** All attached pills are currently shown with vertical scroll capped at two rows. Collapsing overflow into a "+N more" control is pending UX mocks.

## File attachments

Users can attach images via the **+** menu ("Files or images") or by **drag-and-dropping** onto the chat form. Up to 5 images per message. Only `image/*` files are accepted.

File items are read as base64 and sent to da-agent as `attachments` (see [Request body](#request-body)). They are stored on the sent user message as `attachmentsMeta` (no base64) for display in the conversation log.

> **Note:** `addAttachment` is for selection context (blocks, file paths). Binary file attachments go through the internal file picker / drag-and-drop path and are not exposed via `addAttachment`.

## Events in

Components that want to add pills without holding a direct reference to the chat element can dispatch on `document`:

| Event | Detail | Description |
|---|---|---|
| `nx-add-to-chat` | `{ key?, id, label, ...contextFields }` | Adds or replaces a pill. If `key` is set, replaces any existing pill with the same key (use for selection-driven context that changes as the user moves focus). If `key` is omitted, appends a new pill regardless. Dispatching `{ key }` with no `id` removes the pill for that key. |

Context fields on the detail (`blockName`, `innerText`, `proseIndex`) are forwarded to the agent as selection context on the next message. See [Selection context](#selection-context).

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

> **Contract:** Canonical field names are `input` and `output`. Legacy aliases (`args`, `result`, `tool-input-available`, `tool-output-available`) are accepted by the client for backward compatibility — producers should emit canonical names only.

| Type | Legacy alias | Fields | Description |
|---|---|---|---|
| `tool-call` | `tool-input-available` | `toolCallId`, `toolName`, `input` | Agent invoked a tool. Legacy field alias: `args` → `input` |
| `tool-approval-request` | — | `toolCallId`, `approvalId`, `toolName`, `input` | Tool requires user approval; `input` is the same object from `tool-call` and is used to render the approval summary |
| `tool-result` | `tool-output-available` | `toolCallId`, `toolName`, `output` | Tool completed; `output.error` signals failure. Legacy field alias: `result` → `output` |

### Tool card states

A tool card transitions through these states as events arrive:

```
tool-call → running
tool-approval-request → approval-requested  (or → approved directly if auto-approved)
(user approves) → approved → done
(user rejects) → rejected
tool-result (success) → done
tool-result (error) → error
```

`approval-requested` is the only state that requires user action. All other states are informational.

### Tool event ordering guarantees

Within a single stream connection, events for a given `toolCallId` are expected to arrive in order: `tool-call` first, then optionally `tool-approval-request`, then `tool-result` as the terminal event. The client state machine depends on this ordering — a `tool-result` arriving before `tool-call` would produce incorrect state.

> **Contract:** Event ordering per `toolCallId` is a stable contract with da-agent. Breaking changes require a coordinated update on both sides.

**Duplicates:** Should not occur within a stream. The client ignores a duplicate `tool-call` for an already-known `toolCallId` — subsequent events for that id are still processed normally.

**Missing `tool-result`:** If the stream is interrupted, a tool card may be left in `running` or `approval-requested` state indefinitely. `running` is in-memory only and resets on page load. `approval-requested` messages are persisted — `loadInitialMessages` filters incomplete approval sequences on reload to avoid sending unresolved tool-calls to the agent on the next request.

**Reconnect:** The stream is a live feed — events are not replayed on reconnect. A new stream starts fresh; any in-flight tool state from the previous connection is lost.

The approval popover accepts keyboard shortcuts: `Esc` = Reject, `↵` = Approve, `⌘↵` = Always approve.

**If the agent team adds or renames event types, `processEvent` in `utils.js` must be updated to match.**

### Approval summary rendering

The UI picks one field from `input` to display as a human-readable summary beneath the tool name. Priority order:

1. `humanReadableSummary` — preferred; plain-language description of what changed (used by `content_update`)
2. `sourcePath` + `destinationPath` — rendered as `sourcePath → destinationPath` (used by `content_move`)
3. `path` — file path being created or deleted (used by `content_create`, `content_delete`)
4. `skillId` / `name` — identifier for skill/agent creation tools

`content` and other large payload fields are intentionally excluded — they are never shown to the user.

For new tools that require approval, prefer adding a `humanReadableSummary` field to the input schema rather than relying on the fallback chain above.

`tool-result` output is stored in the tool card but not currently rendered. If da-agent adds a `humanReadableSummary` to tool output, it would be the natural place to show a completion summary (e.g. "Created `/drafts/page.md` successfully").

### "Always approve" scope

When the user clicks "Always approve", the tool name is added to an in-memory `Set` on the controller. Subsequent `tool-approval-request` events for that tool are auto-approved via `queueMicrotask`. The set is **conversation-scoped** — it resets only on `clear()`. There is no path-scoping: "always approve" applies to the tool by name regardless of what path the agent acts on, since the path is in the tool input rather than the tool name. There is no cross-session persistence.

## Persistence

Conversation history is persisted in IndexedDB, keyed by `org--site--userId`. This means:

- History is **shared across all pages within a site** — navigating between paths does not start a new conversation.
- History is **user-specific** — different IMS users on the same site have separate histories.
- `clear()` deletes the stored history for the current room.

### Future: sessions

Currently there is one conversation per `org--site--userId` — all or nothing. A session model would let users maintain multiple named conversations and switch between them.

When introduced, the room key would extend to `org--site--userId--sessionId`. The `sessionId` structure and generation strategy are to be defined. The component derives the full room key internally. Persistence and the agent's `room` parameter both use the full key, so sessions are isolated end-to-end. The host never interacts with IndexedDB directly.

If no `session` is set, the component resumes the last active session. A `lastActiveSession` metadata entry in IndexedDB (keyed by `org--site--userId`, storing the active `sessionId`) tracks which session was most recently used and is updated on every switch. Session switching UI (picker, create/rename/delete) lives inside the chat component — the host has no role in session management.

Each session would have a human-readable title so users can make informed switching decisions. The agent would emit a `session-title` stream event after the first exchange — a short generated summary of the conversation intent (e.g. "Update header copy"). The client stores it in session metadata and displays it in the picker. Users can rename sessions; the agent-provided title is only the initial suggestion.

> **Agent team ask:** `session-title` is not yet supported by da-agent. Needs to be raised with the agent team — emit a `session-title` event (with a `title` field) after the first `text-end` in a new session.

## Events out

| Event | Bubbles | Detail | Description |
|---|---|---|---|
| `nx-agent-change` | Yes | — | The agent completed a tool action. Host views can listen to react (e.g. reload the document). Fired once per successful tool-result. |

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
