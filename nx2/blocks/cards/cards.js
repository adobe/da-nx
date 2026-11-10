import { loc } from '../../scripts/nx.js';
import { loadStyle } from '../../utils/utils.js';
import '../shared/tool-card/tool-card.js';
import { attachCardSearch } from '../shared/tool-card/search.js';

const style = await loadStyle(import.meta.url);

// Authored icon `:treeview:` → class `icon-treeview` → short name for nx-tool-card.
const iconName = (col) => [...(col?.querySelector('span.icon')?.classList ?? [])]
  .find((c) => c.startsWith('icon-'))?.slice(5);

function toCard({ row, tools }) {
  const [iconCol, bodyCol] = row.querySelectorAll(':scope > div');
  const heading = bodyCol?.querySelector('h1, h2, h3, h4, h5, h6');
  const card = document.createElement('nx-tool-card');
  card.setAttribute('role', 'listitem');
  card.heading = heading?.textContent.trim() ?? '';
  card.description = [...(bodyCol?.querySelectorAll('p') ?? [])]
    .map((p) => p.textContent.trim()).filter(Boolean).join(' ');

  const href = heading?.querySelector('a')?.href;
  const learnMoreHref = bodyCol?.querySelector('ul a')?.href;
  const icon = iconName(iconCol);
  const tint = iconCol?.querySelector('em')?.textContent.trim();
  if (href) card.href = href;
  if (learnMoreHref) card.learnMoreHref = learnMoreHref;
  if (icon) card.icon = icon;
  if (tint) card.tint = tint;
  if (tools) {
    card.byline = loc`By Adobe`;
    card.bylineIcon = 'byadobe';
  }
  return card;
}

export default function init(el) {
  if (!document.adoptedStyleSheets.includes(style)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];
  }
  const tools = el.classList.contains('tools');
  el.setAttribute('role', 'list');
  el.replaceChildren(...[...el.querySelectorAll(':scope > div')].map((row) => toCard({ row, tools })));
  attachCardSearch(el);
}
