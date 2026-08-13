// AO's USER_INPUT has no structured field for "what the user had selected" or
// "which attachment failed" — inline both into the wire text instead.
export function buildSelectionText(items) {
  if (!items.length) return '';
  const lines = items.map((item) => {
    if (item.type === 'text' && item.innerHTML) {
      return `- Selected text: "${item.innerHTML.replace(/<[^>]+>/g, '').trim()}"`;
    }
    const label = item.innerText ? ` — "${item.innerText}"` : '';
    return `- Selected ${item.type ?? 'block'}: ${item.blockName ?? 'Selection'}${label}`;
  });
  return `[Selected context]\n${lines.join('\n')}\n`;
}

export function buildFailedUploadsText(failed) {
  if (!failed.length) return '';
  const lines = failed.map((a) => `- Attached file: ${a.fileName} — upload failed`);
  return `[Attachments]\n${lines.join('\n')}\n`;
}

export function buildPageContextText(context) {
  const { org, site, path } = context ?? {};
  if (!org || !site) return '';
  return `[Current document — org: ${org}, site: ${site}, path: ${path || '/'}]\n`;
}
