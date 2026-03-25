# `exp-workspace` Overview

This note summarizes the main ideas currently living in the `exp-workspace` branch of the sibling repo at `/Users/hhertach/Documents/code/da/da-nx`.

## What the experiment is

`exp-workspace` is exploring a more workspace-style authoring experience built around three connected pieces:

- `nx/blocks/canvas`: a document editing workspace
- `nx/blocks/browse`: a repository/content browser
- quick edit integration: a live preview surface that can be controlled by the document editor

The branch is not just adding isolated features. It is trying to make DA feel more like a persistent editing environment where browsing files, editing a page, previewing the result, publishing, and sending context into chat all work together.

## Main pieces

### 1. `canvas`: editor workspace

`canvas` is the main experimental shell. It renders a Spectrum-themed workspace (`<da-space>`) with:

- file browsing / file selection
- a document editor (`da-inline-editor`) backed by ProseMirror + Yjs collaboration
- multiple view modes: document, WYSIWYG, and split
- side panels for page outline, metadata, and file history
- integrated chat and "add to chat" context collection
- AEM preview/publish flows, including bulk actions

The most important idea here is that the doc editor can act as the controller for the preview surface, instead of treating preview and editing as completely separate tools.

### 2. Quick edit: parent-controlled preview

There are two related quick edit paths in the branch:

- `nx/blocks/quick-edit-portal`: an older portal-style block that hosts Prose and syncs with a page over `postMessage`
- `nx/public/plugins/quick-edit`: the page-side plugin that loads the preview iframe/editor behavior

The newer `canvas` experiment appears to move toward a parent-controlled model:

- `da-inline-editor` owns the Prose/Yjs editor state
- `canvas/src/quick-edit-controller.js` turns editor content into instrumented HTML
- the quick-edit plugin can run in `controller=parent` mode
- the preview page receives body/cursor/editor updates from the parent editor over a `MessageChannel`

That lets the branch keep a proper document editor in `canvas` while still offering a direct-manipulation preview experience.

It also adds a useful "add to chat" flow: clicking instrumented content in preview can send a block/selection payload back into the workspace chat context.

### 3. `browse`: content browser + chat context

`browse` is a separate shell focused on repository navigation. It wraps a reusable `sl-content-browser` component and combines it with the same chat and bulk AEM patterns used by `canvas`.

The content browser work includes:

- hash-based folder navigation
- list fetching from DA `/list`
- create/save/delete/rename operations against DA `/source` and `/move`
- AEM status enrichment for listed items
- preview/publish actions
- selection-driven chat context
- direct links into canvas or sheet editing flows

This feels like the experiment’s second major theme: move file management into a cleaner, more componentized browser instead of keeping it buried inside a single editor block.

## High-level takeaway

At a high level, `exp-workspace` is experimenting with a DA workspace where:

- `browse` is the repository/file surface
- `canvas` is the editing surface
- quick edit is the live preview/manipulation surface
- chat acts as a cross-cutting assistant that can receive context from both browse selections and preview/editor selections

The code is currently messy, but the product direction is clear: unify browsing, editing, previewing, publishing, and AI context into one authoring workflow.

## Useful ideas to revisit later

- Parent-controlled quick edit instead of a fully separate editor living in the iframe
- Instrumented preview HTML for mapping DOM interactions back to document positions
- Reusable content browser primitives (`sl-content-browser` and related components)
- Chat context collection from both file selections and inline preview selections
- Workspace-style composition with outline, history, metadata, and publishing flows in one place
