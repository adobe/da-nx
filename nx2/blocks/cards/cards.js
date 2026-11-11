import { getConfig, loc } from '../../scripts/nx.js';
import {
  acceptsSiteHash, hashChange, loadStyle, withSiteHash,
} from '../../utils/utils.js';
import '../shared/action-card/action-card.js';
import { attachCardSearch } from './search.js';

const style = await loadStyle(import.meta.url);
const { codeBase } = getConfig();

// Short S2 icon name (`treeview`, `TreeView`, `tree-view`) → icon URL.
const iconUrl = (name) => {
  const short = (name ?? '').toLowerCase().replaceAll('-', '');
  return /^[a-z0-9]+$/.test(short) ? `${codeBase}/img/icons/s2-icon-${short}-20-n.svg` : undefined;
};

// Authored icon `:treeview:` → class `icon-treeview` → `treeview`.
const iconName = (col) => [...(col?.querySelector('span.icon')?.classList ?? [])]
  .find((c) => c.startsWith('icon-'))?.slice(5);

const byAdobe = () => {
  const extra = document.createElement('span');
  extra.slot = 'extra';
  extra.className = 'byline';
  extra.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true"><use href="${iconUrl('byadobe')}#icon" width="100%" height="100%"></use></svg><span class="byline-text"></span>`;
  extra.querySelector('.byline-text').textContent = loc`By Adobe`;
  return extra;
};

function toCard({ row, tools }) {
  const [iconCol, bodyCol] = row.querySelectorAll(':scope > div');
  const heading = bodyCol?.querySelector('h1, h2, h3, h4, h5, h6');
  const href = heading?.querySelector('a')?.href;
  const learnMoreHref = bodyCol?.querySelector('ul a')?.href;
  const icon = iconUrl(iconName(iconCol));
  const tint = iconCol?.querySelector('em')?.textContent.trim();

  const card = document.createElement('nx-action-card');
  // "Open in new tab" opens the current action, which carries the site hash where accepted.
  const links = [
    learnMoreHref && { id: 'learn-more', label: loc`Learn more`, url: () => learnMoreHref },
    href && { id: 'open-new-tab', label: loc`Open in new tab`, url: () => card.action },
  ].filter(Boolean);

  card.setAttribute('role', 'listitem');
  card.heading = heading?.textContent.trim() ?? '';
  card.description = [...(bodyCol?.querySelectorAll('p') ?? [])]
    .map((p) => p.textContent.trim()).filter(Boolean).join(' ');
  card.menu = links.map(({ id, label }) => ({ id, label }));
  if (icon) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('slot', 'icon');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<use href="${icon}#icon" width="100%" height="100%"></use>`;
    card.append(svg);
  }
  if (tint) card.tint = tint;
  // Tools on this site, da.live or author.aem.live carry the page's site path as hash.
  const sync = ({ fullpath } = {}) => {
    if (href) card.action = acceptsSiteHash(href) ? withSiteHash({ href, fullpath }) : href;
  };
  if (href) card.actionLabel = loc`Open`;
  card.addEventListener('select', ({ detail }) => {
    const link = links.find((l) => l.id === detail?.id);
    if (link) window.open(link.url(), '_blank', 'noopener');
  });
  if (tools) card.append(byAdobe());
  return { card, sync };
}

export default function init(el) {
  if (!document.adoptedStyleSheets.includes(style)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];
  }
  const tools = el.classList.contains('tools');
  el.setAttribute('role', 'list');
  const items = [...el.querySelectorAll(':scope > div')].map((row) => toCard({ row, tools }));
  el.replaceChildren(...items.map(({ card }) => card));
  hashChange.subscribe((details) => {
    if (el.isConnected) items.forEach(({ sync }) => sync(details ?? {}));
  });
  attachCardSearch(el);
}
