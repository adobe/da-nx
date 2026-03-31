# Experience Workspace — Architecture & Working Practices

## Architectural Principles

- Context comes from global browser state (URL is the source of truth)
- Features do not import or call each other (see [Component Communication](#component-communication)) - they communicate via events
- Blocks (e.g. Browse, Edit) compose components that implement behavior; blocks define composition, not feature logic
- Each feature should be removable without touching others
- nx provides an extension framework for third-party extensions. Core features do not use this extension framework.
- Components are built as web components using bundled Lit

---

## Top-Level Structure

```
nx
│
├── blocks
│   ├── Browse
│   ├── Edit
│   ├── Chat
│   └── Shared
│       ├── Content Tree (reusable file/folder CRUD utilities)
│       └── Extension Host
└── Utils
    └── sdk.js (Extension Client SDK)

Skills Lab — external app at da.live/apps/skills, linked from Chat
```

---

## Feature Responsibilities

### nx utilities
- Reads workspace context (org, site, path, and related parameters) from the URL; browser state is the source of truth
- Exposes URL-change listeners so components can react to state changes
- Owns auth/identity
- Provides derived context getters to features
- Does NOT contain business logic or feature wiring

### Browse Block
- Implements file browser
- Full management affordances: flat list with drill-down, bulk select, search
- Consumes workspace context; no location or file state of its own

### Edit Block
- Owns breadcrumbs, view mode (doc/wysiwyg/split), and layout state
- Composes features into editing-focused layouts
- Has a collapsible panel on the right side that can display content as needed. Non-exhaustive examples:
  - In-context file browser to switch files quickly without using full browse view
  - Page edit history to show how page changed over time
  - Page metadata to allow viewing and editing
  - Page outline to present overview of sections and blocks on the page

### Chat Block
- Owns conversation state, tool execution, agent communication, and context item accumulator
- Consumes workspace context (org, site, path, view) as read-only
- Runs in Browse and Edit with the same UI; only view context sent to the backend changes

### Shared Block
Provides shared functionality for Browse, Edit and Chat. Examples, non-exhaustive:

- Breadcrumbs
  - Used across views to present the current selected path
- File browser API
  - Exposes APIs used by both browse and the file panel in edit to list files and folders
- Extension host
  - Responsible for mounting, sandboxing, contract enforcement, and lifecycle management of configured extensions
  - Surfaced differently per view, but the host and protocol are singular
  - Extensions communicate with the host through the sdk

---

## Chat Context Model

Chat uses a typed context accumulator built before send.

| Item type | Source | Available in |
|---|---|---|
| Block content | Add-to-chat handle on document blocks (tables, sections) | Edit |
| File attachment | User-uploaded files via chat input | Both |
| Prompt | Saved prompts / skill invocations | Both |
| File / folder reference | Selected items in Browse | Browse |

Chat receives host-pushed context (URL-derived workspace state + accumulated items). It emits outcomes (file created/deleted/moved, navigation requested) via events and `postMessage` and never pulls state from the view directly.

---

## Extension model

**Core features** — we authored them. Always present, fully trusted, full context access. Configuration controls their behavior, never their existence.

**Configured extensions** — we did not author them. Absent by default, sandboxed, minimal contract only.

The API for third-party extensions is defined by the extensions SDK.

---

## Code Structure & Working Practices

### Repository Layout
- The nx repo provides URL/state utilities and auth helpers
- Feature code lives in `blocks/canvas`, `blocks/browse`, `blocks/chat`, and `blocks/shared`
- `blocks/shared` should contain small, reusable pieces that make no assumptions about where they are invoked from
- Root `Utils` contains helpers such as the extension SDK client

### Component Communication
These rules apply workspace-wide.
- Components communicate using events
- Web components communicate with their parents by emitting events on themselves; parents listen via event listeners
- Sibling blocks (e.g. Chat and Browse/Edit) communicate via `window.postMessage()`

### Backend communication
- Use da-fetch to fetch data from the backend
- Da Admin documentation: https://opensource.adobe.com/da-admin/
- Helix Admin documentation: https://www.aem.live/docs/admin.html

### Version Control
- Make small commits with meaningful commit messages
- Keep PRs to the minimum required for a feature; iterate in follow-up PRs

### General Best Practices
- Follow project-wide best practices in `AGENTS.md`
- Implement the minimum code required to make a feature work, and iterate later if needed