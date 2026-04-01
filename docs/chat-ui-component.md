# Chat UI Component — Design & API

## Overview

`da-chat` is a self-contained block following the nx2 block pattern. It is composed of a dumb UI component and a controller that manages state and agent communication. Both live together in `blocks/chat/`.

It is designed to be **composable** — Browse and Edit mount it the same way, driving it through a defined API. It is **reusable** because it has no knowledge of the view that hosts it.

---

## Location & Structure

```
nx2/blocks/chat/
├── chat.js              ← LitElement UI component (dumb, no logic)
├── chat-controller.js   ← controller (state, agent, tools, persistence)
├── chat.css             ← component styles (shadow DOM isolated)
└── chat.test.html       ← local test harness
```

Follows the same pattern as other nx2 blocks (e.g. `profile/`) — self-contained, no cross-block dependencies. UI and controller are split into separate files within the same directory for clarity, not as an architectural boundary between packages.

**Why not `shared/`?** The `profile` block is also used in multiple places and lives directly under `blocks/`. Reusability comes from the block being well-designed — not from directory placement. If a `shared/` convention is established later, this is a structural rename only.

---

## Boundaries

### `chat.js` — UI layer
**Owns:**
- Rendering message list, input, send button, thinking indicator
- User interaction events (submit, keydown)
- Reactive re-rendering when properties change

**Does NOT own:**
- Any business logic
- Any API calls
- Any knowledge of which view it is mounted in
- Auth, agent communication, persistence, tool execution

**Rule:** If it needs an import beyond Lit and its own CSS — it belongs in the controller, not here.

---

### `chat-controller.js` — Controller layer
**Owns:**
- Agent communication (WebSocket / SSE)
- Message history and state
- Tool execution and approval flows
- Conversation persistence (IndexedDB)
- Emitting outcomes (file changed, document updated)

**Does NOT own:**
- Any rendering or DOM manipulation
- Any view-specific logic (document revert, editor state)
- IMS authentication — receives token from the host, never fetches it

**Rule:** If it needs to know anything about Browse or Edit internals — that concern belongs in the view, injected as a callback or config.

---

### View (Browse / Edit) — Host layer
**Owns:**
- Mounting `<da-chat>` in its layout
- Pushing shell context into chat (org, site, path, view) via properties
- Injecting view-specific callbacks (e.g. document revert for Edit) via properties
- Managing chat panel visibility and dimensions

**Does NOT own:**
- Chat state
- Controller instantiation — `da-chat` creates and manages its own controller
- Agent communication
- Message rendering

**Rule:** The view drives chat through the public API only — properties in, events out. It never reaches into chat internals.

---

### Directionality — enforced, not assumed

```
Shell context
      ↓
   View (Browse / Edit)
      ↓ properties in
   da-chat (UI)
      ↓ events out
   View handles outcome
      ↓
   Controller executes
      ↓ onUpdate()
   da-chat re-renders
```

**The controller never imports from Browse or Edit.** If the controller needs view-specific behavior, the view injects it as a callback at instantiation time. Communication is always top-down — views drive chat, chat never reaches back into views.

---

## Component API

### Properties In

Built up incrementally — start with what is known for certain, extend as each layer is added.

#### Layer 1 — Basic conversation

| Property | Type | Description |
|----------|------|-------------|
| `messages` | `Array` | Conversation history. Component never mutates this. |
| `thinking` | `Boolean` | Agent is processing. Disables input and send button. |

**Message shape:**
```js
// User message
{ role: 'user', content: string }

// Assistant text response
{ role: 'assistant', content: string }

// Assistant tool call
{ role: 'assistant', content: [
  { type: 'tool-call', toolCallId, toolName, input: object },
  { type: 'tool-approval-request', approvalId, toolCallId }  // optional
]}

// Tool result
{ role: 'tool', content: [
  { type: 'tool-result', toolCallId, output: unknown, error?: unknown }
]}
```

*Note: message structure matches current exp-workspace implementation — no reason to change.*

---

### Events Out

#### Layer 1 — Basic conversation

| Event | Detail | Description |
|-------|--------|-------------|
| `da-chat-submit` | `{ message: string }` | User submitted a message |

---

## Layers — To Be Added

The following will be added incrementally as the base layer is stable. Each layer extends properties in and/or events out.

| Layer | Properties added | Events added |
|-------|-----------------|--------------|
| 2 — Context items | `contextItems: Array` | `da-chat-context-remove: { index }` |
| 3 — Tool approval | `awaitingApproval: Boolean` | `da-chat-tool-approve: { approvalId, approved }` |
| 4 — Streaming | `streamingText: String` | — |
| 5 — Connection state | `connected: Boolean`, `statusText: String` | — |
| 6 — Prompts / skills | `prompts: Array` | `da-chat-prompt-select: { prompt }` |

---

## Findings from exp-workspace — Things to Keep in Mind

Coupling points found in the current `chat.js` implementation that must be resolved during the isolation process.

### 1. IMS auth imported directly in chat.js
`initIms()` is called at module load time in chat.js. Auth is a shell concern.
**Resolution:** Shell inits auth, passes token to controller at instantiation. UI never touches auth.

### 2. Skills CRUD imported directly in chat.js
`loadSkills()`, `saveSkill()`, `deleteSkill()` are imported and called from the UI layer.
**Resolution:** Move to controller. UI emits intent, controller executes.

### 3. Window events dispatched from chat.js
`da:agent-content-updated` and `da:chat-repo-files-changed` are dispatched to `window` from inside the UI.
**Resolution:** Controller outputs only. Controller dispatches or callbacks; UI is unaware these events exist.

### 4. Edit-view-specific callbacks as component properties
`getRevertSnapshotAemHtml` and `revertCollabDoc` are function props passed into chat — edit view concerns.
**Resolution:** Injected into the controller by the Edit view at instantiation. UI has no concept of document reverting.

### 5. ChatController is already clean
`chat-controller.js` has zero external dependencies (no da-live, no IMS, no skills editor). The isolation work is almost entirely about moving things out of chat.js.

### 6. State flow is already unidirectional
ChatController state → `onUpdate()` → chat.js re-renders. Preserve as-is.

### 7. `contextView` hardcoded view assumption
chat.js defaults context-view to `'edit'`. For a view-agnostic component, view context must be passed in explicitly — no defaults that assume a context.

### 8. `onPageContextItems` is already an array accumulator
The multi-type context accumulator pattern is proven. Browse file/folder references slot in as additional item types — no structural change, only extending the item type vocabulary.
