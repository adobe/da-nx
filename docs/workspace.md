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
- Feature code lives in **`nx2/blocks/`** — currently including **`canvas`** (the edit experience; not a separate edit block), **`chat`**, shell pieces (**`nav`**, **`sidenav`**, **`profile`**), **`fragment`** / **`dialog`**, and small helpers (**`canvas-actions`**).
- Shared shell behavior for app-frame side regions is implemented in **`nx2/utils/panel.js`** (DOM panel chrome, resize, show/hide, persistence), not as a separate `blocks/panel` Lit shell.
- **`blocks/tool-panel`** provides the managed panel shell (`nx-tool-panel`): a picker to switch between views, a header-actions zone for first-party views, and a close button. Consumer content is lazy-loaded on first activation. Like chat, `nx-tool-panel` is position-agnostic — host blocks instantiate it and set its `views` array inside their own `getContent`.
- **`blocks/chat`** has no public entry-point wrapper — host blocks mount `nx-chat` directly inside their own `getContent`.
- When **`blocks/shared`** (or equivalent) exists, it should contain small, reusable pieces that make no assumptions about where they are invoked from.
- Root **`Utils`** contains helpers such as the extension SDK client, DA API wrappers, and DA file system utilities — no DOM or rendering concerns.

### Component Communication
- Components pass props down to their children
- Components add event listeners to their children to receive data
- Communicating with a component further outside of the parent/child relationship is also done via props and events, obtaining the component using document.querySelector(...).

### Backend communication
- Use `daFetch` from `nx2/utils/daFetch.js` to fetch data from the backend
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
│   ├── tool-panel      (managed panel shell: picker, header-actions zone, consumer lifecycle)
│   └── …               (e.g. browse when added as its own block)
│
└── utils
    ├── panel.js        (aside.panel shell, open/hide, persistence)
    ├── daFetch.js      (DA origins + authenticated fetch)
    ├── daFiles.js      (DA file system utilities)
    ├── daConfig.js     (site config fetching)
    └── sdk.js          (Extension Client SDK, when used)

Skills Lab — external app at da.live/apps/skills, linked from Chat
```

---

## Side panels (app-frame)

- Panels are **`aside.panel`** elements with **`data-position="before"`** (to the left of `main`) or **`"after"`** (to the right). Width is stored on the element; **`setPanelsGrid()`** updates CSS grid template vars on `body` when panels are visible.
- **`hidePanel` / `showPanel`** toggle visibility without removing the node; hidden panels are omitted from the grid. Any consumer can close its panel by dispatching an **`nx-panel-close`** event — the panel frame handles it.
- **`localStorage`** key **`nx-panels`** stores `{ [section]: { width } }` per registered section, so width is remembered across pages that share the same section. **`wasPanelOpen(section)`** tells a host page whether that section was left open last time; the host decides itself whether/how to reopen it on load (e.g. canvas, browse, and form each do this in their own decorate flow).
- **`registerPanelSection(name, { position, width, getContent, onShow? })`** declares a section a host page owns, once per host page. `onShow`, if given, runs after the section's panel is open — e.g. to activate a specific view inside a tool-panel; it isn't called at all for sections with no sub-items. **`PANEL_EVENT.OPEN`** / **`PANEL_EVENT.CLOSE`** (`nx-panel-open` / `nx-panel-close`, dispatched on `document`) are the cross-boundary way to open/close a registered section by name from anywhere — headers, toolbars, BYO plugin iframes — without importing `panel.js` directly. **`getSectionAtPosition(position)`** is the reverse lookup for position-oriented UI (e.g. a before/after toggle button) that needs "whichever section lives here" without hardcoding which one that is.

### Two panel types

The distinction between panel types is a **caller convention**, not a framework concept.

**Headless** — `getContent` returns a component that owns its entire layout: header, actions, close button. Used when a single, known first-party component permanently occupies the panel

**Managed** — `getContent` imports and instantiates `nx-tool-panel`, sets its `views` array, and returns it. `nx-tool-panel` then owns the header with a consumer picker, actions zone, and close button. Used when multiple views share a panel (e.g. tools and extensions).

### Consumer contract (managed panels)

Each consumer is a descriptor object passed in the `views` array:

```js
{
  id: 'my-tool',       // unique string key
  label: 'My Tool',    // shown in the picker
  firstParty: true,    // omit or false for third-party
  load: async () => element, // called once on first activation; must return an HTMLElement
}
```

Each consumer registered with a managed panel declares whether it is **first-party** or not:

- **First-party views** (`firstParty: true`) are authored by the workspace team, fully trusted, and may expose header actions by implementing a `getHeaderActions()` method on the element returned by `load()`. The method should return an `HTMLElement` (or `null`/`undefined` to add nothing). It is called each time the consumer becomes active.
- **Third-party / fragment views** are not authored by the team. They receive only the content area; they cannot add anything to the header. This is the default for extensions and external fragments.

Consumer content is lazy-loaded on first activation and preserved across open/close cycles — switching views or hiding the panel does not reload content.

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
- Listens for panel open events from **`nx-canvas-header`** and opens the matching panel via **`panel.js`**. Owns a `CANVAS_PANELS` config object keyed by position — each entry carries a default `width` and a `getContent` callback. `openCanvasPanel(position)` does a config lookup and calls `openPanel` directly; no dependency on block-specific helpers like `openChatPanel`.
- Owns the panel configuration for its context: which positions are supported and what `getContent` each panel uses. Browse or other page-level blocks define their own panel configurations independently.
- Side regions use the same panel model: **`before`** / **`after`** asides can host in-context browser, history, metadata, outline, etc., registered as views through the managed panel — toggled from the header chrome or other entry points as the product defines.
- Adopts **`canvas.css`** once on the document for light-DOM rules that apply outside the header shadow root.

### Browse Block
- Implements file browser
- Full management affordances: flat list with drill-down, bulk select, search
- Consumes workspace context; no location or file state of its own

### Chat Block
- Owns conversation state, tool execution, agent communication, and context item accumulator
- Consumes workspace context (org, site, path, view) as read-only
- Runs in Browse and in the edit (`canvas`) view with the same UI; only view context sent to the backend changes
- Chat is position-agnostic — host blocks (canvas, browse) decide to mount it in the `before` panel via their own `getContent`. Once mounted, chat owns its full internal layout: header, context-sensitive actions, and the close control.

### Shared Block
Provides shared functionality for Browse, the edit (`canvas`) experience, and Chat. Examples, non-exhaustive:

- Breadcrumbs
  - Used across views to present the current selected path
- File browser API
  - Shared DA file utilities (`listFolder`, `itemHashPath`) live in `nx2/utils/daFiles.js` — consumed by both the Browse block and the canvas Files panel
- Extension host
  - Responsible for mounting, sandboxing, contract enforcement, and lifecycle management of configured extensions
  - Surfaced differently per view, but the host and protocol are singular
  - Extensions communicate with the host through the sdk

---

## Chat Context Model

Chat receives host-pushed context (URL-derived workspace state + accumulated context items). It emits outcomes (file created/deleted/moved, navigation requested) via events and `postMessage` and never pulls state from the view directly.

For the full context model — item types, `nx-add-to-chat` event shape, `selectionContext` wire format, and agent contract — see [chat-ui-component.md](chat-ui-component.md#selection-context).

---

## Extension model

**Core features** — we authored them. Always present, fully trusted, full context access. Configuration controls their behavior, never their existence.

**Configured extensions** — we did not author them. Absent by default, sandboxed, minimal contract only.

In the panel system this maps directly: core features are first-party views and may add actions to the managed panel header; configured extensions are third-party views and receive only the content area.

The API for third-party extensions is defined by the extensions SDK.
