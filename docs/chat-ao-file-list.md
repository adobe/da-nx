# FileList artifacts

`FileList` displays an agent-titled collection of content files in Experience
Workspace chat. Each row is a native hash link: `/org/site/page.html` opens
`#/org/site/page` without reloading the editor or losing the chat session.
The current file is highlighted automatically, including after back/forward
navigation. Other suffixes are preserved; the current editor must support the
listed file type.

The renderer is registered in `nx2/blocks/chat-ao/artifacts/file-list.js`.
`file-list.schema.json` describes the agent-facing contract. The chat advertises
the adjacent `component-catalog.json` when starting a new Coworker or CMA session.
This generated catalog preserves the existing upstream components and functions
and adds `FileList`. Refresh it with `npm run build:chat-catalog`; update the
pinned upstream URL in `tools/build-chat-catalog.mjs` when adopting a new catalog.
Do not edit the generated catalog by hand.

The catalog must be publicly reachable by the agent backend. Publish the Nexter
branch before testing with `?nx=filelist`; a localhost-only catalog cannot be
fetched by the backend. Start a **new chat** after changing the catalog.
No da-live source changes are necessary.

## User-level skill instructions

Include this in the skill's `SKILL.md`:

```markdown
## Present the files

After identifying the affected pages, create an interactive UI artifact using
the available FileList catalog component. Use the chat harness's artifact
creation mechanism, not a Markdown code block or HTML.

- Set title to a short heading describing this collection, such as
  "Pages to update".
- Set items to the actual pages returned by the content tools. Each item has
  a human-readable title and an absolute DA content path:
  /organization/site/folder/page.html.
- Resolve organization and site from the current workspace or tool results.
  Do not invent file paths, use preview URLs, or pass /page.html without its
  organization and site.
- Preserve the file extension in the data. Navigation and the "Viewing" state
  are handled by the component; do not generate those fields yourself.
- If the component is unavailable, return a plain-text file list instead.
```

Example flat component record (inside the artifact's `components` array):

```json
{
  "id": "root",
  "component": "FileList",
  "title": "Pages to update",
  "items": [
    { "title": "Home", "path": "/my-org/my-site/index.html" },
    { "title": "About us", "path": "/my-org/my-site/about.html" },
    {
      "title": "Living room",
      "path": "/my-org/my-site/collections/living-room.html"
    }
  ]
}
```

This is the component payload, not a standalone artifact-tool invocation.
The exact artifact tool and envelope belong to the chat harness. Both Coworker
and CMA controllers advertise the catalog on the first `USER_INPUT` of a new
session and render `ui_artifact_created` events through the same component
registry. The CMA bridge must consume `catalogUrl`, expose an artifact-creation
mechanism to its agent, and emit the compatible artifact events; client-side
support alone does not establish that the deployed backend supports generation.
Existing resumed sessions do not receive a new catalog.
