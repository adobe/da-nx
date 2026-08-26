// See docs/chat-ao-component.md#client-context for why this stays in `text`.
export function buildFailedUploadsText(failed) {
  if (!failed.length) return '';
  const lines = failed.map((a) => `- Attached file: ${a.fileName} — upload failed`);
  return `[Attachments]\n${lines.join('\n')}\n`;
}

function selectionResource(item) {
  if (item.type === 'text' && item.innerHTML) {
    return { type: 'text-selection', name: item.innerHTML.replace(/<[^>]+>/g, '').trim() };
  }
  return { type: item.type ?? 'block', id: item.id, name: item.blockName ?? item.innerText ?? 'Selection' };
}

// See docs/chat-ao-component.md#client-context for the id/description split.
function documentResource(org, site, path) {
  const normalizedPath = (path || '').replace(/^\//, '');
  return {
    type: 'document',
    id: `${org}/${site}/${normalizedPath}`,
    name: path || '/',
    description: `Organization: ${org}, Site: ${site}`,
  };
}

// Core wording ("an intelligent authoring surface...") is docs.da.live's own
// product description (docs.da.live/about/early-access/experience-workspace).
const APPLICATION = {
  id: 'da.live',
  name: 'Experience Workspace',
  description: 'Experience Workspace, built on da.live: an intelligent authoring surface '
    + 'where humans and AI agents collaborate to build, edit, and optimize digital experiences.',
};

// See docs/chat-ao-component.md#client-context for the ranking rationale.
export function buildClientContext(context, items = []) {
  const { org, site, path } = context ?? {};
  const focusedResources = [
    ...(org && site ? [documentResource(org, site, path)] : []),
    ...items.map(selectionResource),
  ];
  return {
    application: APPLICATION,
    ...(focusedResources.length && { focused_resources: focusedResources }),
  };
}
