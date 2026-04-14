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
{ role: 'assistant', content: string }
{ role: 'tool', ... }  // filtered from display automatically
```

## Agent stream contract

The controller consumes a server-sent event stream from `da-agent`. Each line is a JSON object with a `type` field. The UI depends on the following event types:

### Text events

| Type | Fields | Description |
|---|---|---|
| `text-delta` | `delta` / `textDelta` / `text` | Incremental text chunk — appended to streaming buffer |
| `text-end` | — | Flush streaming buffer as a committed assistant message |
| `finish-message` / `finish` | — | Stream complete |
| `error` | `errorText` / `error.message` | Agent error — thrown, caught by controller |

### Tool events

| Type | Aliases | Fields | Description |
|---|---|---|---|
| `tool-call` | `tool-input-available` | `toolCallId`, `toolName`, `input` / `args` | Agent invoked a tool |
| `tool-approval-request` | — | `toolCallId`, `approvalId`, `toolName`, `input` | Tool requires user approval; `input` is the same args object from `tool-call` and is used to render the approval summary |
| `tool-result` | `tool-output-available` | `toolCallId`, `toolName`, `output` / `result` | Tool completed; `output.error` signals failure |

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

## Boundaries

- **UI (`chat.js`)** — rendering only. No API calls, no auth, no view-specific logic.
- **Controller (`chat-controller.js`)** — agent communication, message state, persistence. No DOM access.
- **Host view** — mounts `<nx-chat>`, injects context and view-specific callbacks as properties. Never reaches into chat internals.

View-specific callbacks (e.g. document revert for Edit) are injected as properties on the controller — not as component properties. The view owns what to inject; chat owns how to use it.
