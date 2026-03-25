# Clean Architecture Proposal For `exp-workspace` Ideas

This note describes how we could bring the good ideas from `exp-workspace` into this `hlxsixfive` copy in a cleaner way.

The goal is not to port the experimental branch file-for-file. The goal is to preserve the product direction while separating responsibilities so each piece is easier to reason about, test, and evolve.

## Guiding principles

- Keep blocks thin and compositional
- Push data fetching and data transforms into small utility modules
- Keep preview/edit synchronization behind a narrow protocol
- Treat chat context as a shared capability, not a feature hidden inside one block
- Preserve lazy loading so non-LCP authoring features do not leak into core page startup
- Avoid exposing unstable internals in `/nx/public` until the contracts are intentionally designed

## The architecture we should aim for

We should split the future workspace into four layers.

## 1. Shell blocks

These are the user-facing entry points:

- `nx/blocks/canvas`
- `nx/blocks/browse`
- later, possibly a lighter `nx/blocks/quick-edit-shell` if needed

Each shell block should do only a few things:

- render layout
- own top-level UI state
- wire events between child components
- lazy load heavy features after first render

The shell blocks should not directly contain DA fetch logic, ProseMirror transformation logic, AEM status enrichment, or cross-window message handling details.

## 2. Feature components

These are stateful UI components that can be assembled inside the shells.

For `canvas`, likely components are:

- workspace split layout
- file sidebar
- document editor panel
- preview panel
- outline panel
- metadata panel
- history panel
- chat panel

For `browse`, likely components are:

- content browser shell
- folder/list table
- search + filter controls
- selection toolbar
- create/rename/delete dialogs
- toast host

These components should focus on presentation and local interaction state. They should receive data and callbacks through well-defined inputs.

## 3. Headless controllers and services

This is where most of the messy `exp-workspace` logic should move.

Recommended service areas:

- `workspace/preview-controller`
  Manages the parent-to-preview protocol, `MessageChannel`, body sync, cursor sync, and selection sync.
- `workspace/chat-context`
  Converts selections from browse or preview into a normalized chat context format.
- `workspace/document`
  Owns Prose/Yjs bootstrapping, document serialization, block-position extraction, and editor-side helpers.
- `workspace/content-api`
  Wraps DA list/create/rename/delete calls and returns consistent result objects.
- `workspace/aem-api`
  Wraps preview/publish/status calls and keeps AEM details out of UI code.

These modules should be plain JavaScript utilities or small controller classes/functions. They should not know about Lit rendering details unless absolutely necessary.

## 4. Pure utilities

Small, testable helpers should live below the services:

- path parsing
- file kind detection
- hash routing helpers
- document instrumentation helpers
- AEM response normalization
- selection-to-context transforms

Anything that can be pure should stay pure.

## Suggested directory shape

One clean direction would be:

```text
nx/
  blocks/
    browse/
      browse.js
      browse.css
      src/
        browse-shell.js
        content-browser.js
        browse-dialogs.js
    canvas/
      canvas.js
      canvas.css
      src/
        canvas-shell.js
        document-panel.js
        preview-panel.js
        sidebar-panel.js
        chat-panel.js
  utils/
    workspace/
      document/
        init-prose.js
        serialize-aem.js
        block-map.js
      preview/
        preview-controller.js
        preview-protocol.js
      chat/
        context-items.js
      content/
        da-content-api.js
        content-filters.js
      aem/
        aem-api.js
```

The important part is not the exact names. The important part is keeping block code small and moving domain logic into reusable headless modules.

## Key refactors from the experiment

## 1. Replace mixed UI/protocol code with a dedicated preview controller

In `exp-workspace`, preview control behavior is spread across:

- `da-inline-editor`
- `quick-edit-controller`
- `quick-edit-portal`
- the public quick-edit plugin

A cleaner version should define one explicit preview protocol module:

- `connectPreview()`
- `sendBody()`
- `sendCursorState()`
- `sendEditorSelection()`
- `handlePreviewMessage()`

Then the document editor can use that controller, and the preview plugin can implement only the receiving side.

That gives us one place to evolve the contract instead of re-spreading `postMessage` logic through multiple files.

## 2. Separate document editing from preview serialization

Right now the experiment blends several concerns:

- initializing the editor
- collaboration setup
- converting Prose content to previewable HTML
- instrumenting the HTML with block and node positions
- handling block moves/additions

We should break that into three modules:

- editor runtime
- document serialization/instrumentation
- structural editing helpers

That keeps the main editor component focused on lifecycle and rendering instead of becoming the dumping ground for every document-related behavior.

## 3. Standardize chat context

One strong idea in the experiment is that both browse and preview can feed chat.

We should formalize a single chat context shape, for example:

```js
{
  kind: 'repo-file' | 'document-node' | 'document-block',
  source: 'browse' | 'preview' | 'editor',
  path: 'org/repo/path',
  proseIndex: 123,
  label: 'Hero',
  text: 'Selected content...'
}
```

Then browse, preview, and editor code can all emit the same structure. Chat only needs one ingestion path.

## 4. Treat browse as a reusable product, not just a canvas sidebar

The experimental `browse` work is already closer to this.

We should keep:

- a standalone content browser block
- pure API helpers for DA and AEM work
- isolated table/filter/dialog components

We should avoid:

- browse-specific business rules buried in UI components
- hard coupling to canvas internals
- duplicating DA path and AEM status logic in multiple places

This gives us a content browser that can later be used by `canvas`, by a standalone browse page, or by other authoring tools.

## 5. Keep public quick-edit separate from experimental workspace internals

The public plugin in `/nx/public` should remain conservative.

If we adopt ideas from the parent-controlled preview flow, we should first stabilize the internal workspace protocol inside non-public modules. Only after the contract is stable should we decide what belongs in `/nx/public`.

That protects backwards compatibility and keeps us from publishing experimental architecture by accident.

## Migration strategy

I would approach this in phases.

## Phase 1: establish shared headless modules

Build the reusable low-level modules first:

- path and routing helpers
- DA content API helpers
- AEM API helpers
- chat context normalization
- preview protocol helpers

This gives us solid foundations without committing to final UI structure too early.

## Phase 2: rebuild `browse`

`browse` is the safest place to start because it is more naturally componentized and less tangled with editor/runtime concerns.

Target outcome:

- a clean standalone browse block
- reusable content browser components
- normalized DA/AEM service layer
- selection-to-chat integration through shared context helpers

## Phase 3: rebuild `canvas`

Once the service layer is stable, build `canvas` around:

- a document panel
- a preview panel
- shared preview controller
- side panels as separate components

This should be treated as composition work, not as one giant `space.js` file.

## Phase 4: decide what belongs in public SDK

Only after the internal architecture is stable should we decide whether any quick-edit or content-browser pieces belong in `/nx/public`.

## What we should probably not port directly

- giant multi-purpose shell files like `space.js`
- duplicated quick-edit logic split across old and new flows
- UI components that also own fetch logic and protocol logic
- ad hoc event names and payload shapes that are not documented anywhere

Those ideas can still be valuable, but they should be re-expressed through cleaner boundaries.

## Short version

The clean version of `exp-workspace` should look like this:

- `browse` becomes a reusable content browser product
- `canvas` becomes a composition shell around editor, preview, chat, and side panels
- quick edit becomes a narrow preview-control protocol instead of a spread-out implementation detail
- DA, AEM, and chat-context logic move into shared headless modules

That should let us keep the ambitious workflow ideas from the experiment while making the codebase much easier to maintain in this branch.
