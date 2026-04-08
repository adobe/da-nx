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

## Events out

| Event            | Detail                | Description              |
| ---------------- | --------------------- | ------------------------ |
| `nx-chat-submit` | `{ message: string }` | User submitted a message |

## Boundaries

- **UI (`chat.js`)** — rendering only. No API calls, no auth, no view-specific logic.
- **Controller (`chat-controller.js`)** — agent communication, message state, persistence. No DOM access.
- **Host view** — mounts `<nx-chat>`, injects context and view-specific callbacks as properties. Never reaches into chat internals.

View-specific callbacks (e.g. document revert for Edit) are injected as properties on the controller — not as component properties. The view owns what to inject; chat owns how to use it.
