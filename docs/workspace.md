# Experience Workspace — Architecture & Working Practices

## Architectural Principles

The following general principles apply:

- Context comes from global browser state (URL is the source of truth)
- Components communicate by passing down props, and sending up events
- Blocks (e.g. Browse, edit/canvas) compose components that implement behavior; blocks define composition, not feature logic
- Each feature should be removable without touching others
- nx provides an extension framework for third-party extensions. Core features do not use this extension framework.
- Components are built as web components using bundled Lit

The following sections highlight some principles in more detail.

### Repository Layout
- Experience workspace work lives under **`nx2/`** (alongside the CDN-mapped `nx/` tree).
- The nx2 scripts and utils provide URL/state helpers, auth, and block loading (`nx2/scripts/nx.js`, `nx2/utils/`).
- Feature code lives in **`nx2/blocks/`** — currently including **`canvas`** (the edit experience; not a separate edit block), **`chat`**, shell pieces (**`nav`**, **`sidenav`**, **`profile`**), **`fragment`** / **`dialog`**, and small helpers (**`action-button`**, **`canvas-actions`**). **`tool-panel`** is a placeholder block; tool UI is intended to ship inside loaded fragments.
- Shared shell behavior for app-frame side regions is implemented in **`nx2/utils/panel.js`** (DOM panel chrome, resize, show/hide, persistence), not as a separate `blocks/panel` Lit shell.
- When **`blocks/shared`** (or equivalent) exists, it should contain small, reusable pieces that make no assumptions about where they are invoked from.
- Root **`Utils`** contains helpers such as the extension SDK client and DA API wrappers (`api.js`, `daFetch`).

### Component Communication
- Components pass props down to their children
- Components add event listeners to their children to receive data
- Communicating with a component further outside of the parent/child relationship is also done via props and events, obtaining the component using document.querySelector(...).

### Backend communication
- Use da-fetch (via project utilities such as `api.js`) to fetch data from the backend
- Da Admin documentation: https://opensource.adobe.com/da-admin/
- Helix Admin documentation: https://www.aem.live/docs/admin.html

### Version Control
- Make small commits with meaningful commit messages
- Keep PRs to the minimum required for a feature; iterate in follow-up PRs

### General Best Practices
- Follow project-wide best practices in `AGENTS.md`
- Implement the minimum code required to make a feature work, and iterate later if needed

---

## Top-Level Structure

```
nx2
│
├── blocks
│   ├── canvas          (edit: nx-canvas-header, panel toggles, main editing layout)
│   ├── chat
│   ├── tool-panel      (placeholder; content from fragments)
│   └── …               (e.g. browse when added as its own block)
│
└── utils
    ├── panel.js        (aside.panel shell, open/hide, fragment load, persistence)
    ├── api.js          (daFetch and DA endpoints)
    └── sdk.js          (Extension Client SDK, when used)

Skills Lab — external app at da.live/apps/skills, linked from Chat
```

---

## Side panels (app-frame)

- Panels are **`aside.panel`** elements with **`data-position="before"`** (to the left of `main`) or **`"after"`** (to the right). Width is stored on the element; **`setPanelsGrid()`** updates CSS grid template vars on `body` when panels are visible.
- **`openPanelWithFragment`** loads markup via **`loadPanelContent`** (fragment URLs or, for legacy paths, block modules), then **`showPanel`** mounts the shell and appends content into **`.panel-body`**.
- **`hidePanel` / `unhidePanel`** toggle visibility without removing the node; hidden panels are omitted from the grid.
- **`localStorage`** key **`nx-panels`** stores `{ before?, after? }` with width and fragment URL. **`restorePanels()`** is invoked from **`loadArea`** in **`nx2/scripts/nx.js`** when that key is present so panels return across reloads.

---

## Feature Responsibilities

### nx utilities
- Reads workspace context (org, site, path, and related parameters) from the URL; browser state is the source of truth
- Exposes URL-change listeners so components can react to state changes
- Owns auth/identity
- Provides derived context getters to features
- Does NOT contain business logic or feature wiring

### Edit block (`canvas`)
The edit experience is implemented as the **`canvas`** block — there is not a separate edit block. Responsibilities:

- Owns the editing workspace: breadcrumbs, view mode (doc/wysiwyg/split), and layout state as those features land; composes editing-focused layouts around **`main`**.
- Decorates the canvas region with **`nx-canvas-header`** (Lit toolbar: e.g. split icons for panel edges, undo/redo affordances).
- Listens for **`nx-canvas-toggle-panel`** (`detail.position`: **`before`** | **`after`**) and calls **`toggleCanvasPanel`** in **`canvas.js`**: show or hide the matching **`aside.panel`**, or **`openPanelWithFragment`** with the configured fragment URL (e.g. chat before main, tool panel after main).
- Side regions use the same panel model: **`before`** / **`after`** asides can host in-context browser, history, metadata, outline, etc., loaded as fragments or blocks through **`panel.js`** — toggled from the header chrome or other entry points as the product defines.
- Adopts **`canvas.css`** once on the document for light-DOM rules that apply outside the header shadow root.

### Browse Block
- Implements file browser
- Full management affordances: flat list with drill-down, bulk select, search
- Consumes workspace context; no location or file state of its own

### Chat Block
- Owns conversation state, tool execution, agent communication, and context item accumulator
- Consumes workspace context (org, site, path, view) as read-only
- Runs in Browse and in the edit (`canvas`) view with the same UI; only view context sent to the backend changes
- In the app-frame experiment, the chat surface may be loaded as fragment content inside a **`before`** panel opened from the canvas header.

### Shared Block
Provides shared functionality for Browse, the edit (`canvas`) experience, and Chat. Examples, non-exhaustive:

- Breadcrumbs
  - Used across views to present the current selected path
- File browser API
  - Exposes APIs used by both browse and side panels in the edit view to list files and folders
- Extension host
  - Responsible for mounting, sandboxing, contract enforcement, and lifecycle management of configured extensions
  - Surfaced differently per view, but the host and protocol are singular
  - Extensions communicate with the host through the sdk

---

## Chat Context Model

Chat uses a typed context accumulator built before send.

| Item type | Source | Available in |
|---|---|---|
| Block content | Add-to-chat handle on document blocks (tables, sections) | Edit (`canvas`) |
| File attachment | User-uploaded files via chat input | Both |
| Prompt | Saved prompts / skill invocations | Both |
| File / folder reference | Selected items in Browse | Browse |

Chat receives host-pushed context (URL-derived workspace state + accumulated items). It emits outcomes (file created/deleted/moved, navigation requested) via events and `postMessage` and never pulls state from the view directly.

---

## Extension model

**Core features** — we authored them. Always present, fully trusted, full context access. Configuration controls their behavior, never their existence.

**Configured extensions** — we did not author them. Absent by default, sandboxed, minimal contract only.

The API for third-party extensions is defined by the extensions SDK.
