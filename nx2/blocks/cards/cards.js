import { getConfig, loc } from '../../scripts/nx.js';
import { loadStyle } from '../../utils/utils.js';

const { codeBase } = getConfig();

const style = await loadStyle(import.meta.url);

const loadMenu = (() => {
  let promise;
  return () => {
    promise ??= import('../shared/menu/menu.js');
    return promise;
  };
})();

// Authored as the short icon name, e.g. `:treeview:` → `icon-treeview` → `s2-icon-treeview-20-n`.
const iconName = (span) => {
  const name = [...span.classList].find((c) => c.startsWith('icon-'))
    ?.slice(5).toLowerCase().replaceAll('-', '');
  return /^[a-z0-9]+$/.test(name ?? '') ? `s2-icon-${name}-20-n` : '';
};

// `use` at 100% scales the referenced <svg> (whatever its native size) into this frame.
const iconSvg = (name) => `<svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/${name}.svg#icon" width="100%" height="100%"></use></svg>`;

const isExternal = (href) => new URL(href, window.location.href).origin !== window.location.origin;

const getMenuItems = ({ href, learnMore }) => [
  learnMore && { id: 'learn-more', label: loc`Learn more`, url: learnMore },
  href && { id: 'open-new-tab', label: loc`Open in new tab`, url: href },
].filter(Boolean);

function decorateIcon(col) {
  const tile = document.createElement('div');
  tile.className = 'card-icon';

  const em = col?.querySelector('em');
  const color = em?.textContent.trim();
  if (color && CSS.supports('color', color)) {
    tile.classList.add('has-bg');
    tile.style.setProperty('--card-icon-bg', color);
  }

  const span = col?.querySelector('span.icon');
  const name = span && iconName(span);
  if (name) tile.innerHTML = iconSvg(name);
  return tile;
}

function buildMoreButton(title) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'card-more';
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', `${loc`More options for`} ${title}`);
  btn.innerHTML = iconSvg('s2-icon-more-20-n');
  return btn;
}

function buildFooter({ href, title }) {
  const footer = document.createElement('div');
  footer.className = 'card-footer';

  const byline = document.createElement('span');
  byline.className = 'card-byline';
  const logo = document.createElement('span');
  logo.className = 'card-byline-logo';
  logo.innerHTML = iconSvg('s2-icon-byadobe-20-n');
  const text = document.createElement('span');
  text.className = 'card-byline-text';
  text.textContent = loc`By Adobe`;
  byline.append(logo, text);
  footer.append(byline);

  if (href) {
    const open = document.createElement('a');
    open.className = 'card-open';
    open.href = href;
    open.textContent = loc`Open`;
    open.setAttribute('aria-label', `${loc`Open`} ${title}`);
    if (isExternal(href)) {
      open.target = '_blank';
      open.rel = 'noopener';
    }
    footer.append(open);
  }
  return footer;
}

function decorateCard(row) {
  const [iconCol, bodyCol] = row.querySelectorAll(':scope > div');
  const body = bodyCol ?? document.createElement('div');

  const heading = body.querySelector('h1, h2, h3, h4, h5, h6');
  const titleLink = heading?.querySelector('a');
  const href = titleLink?.href;
  if (titleLink) titleLink.replaceWith(...titleLink.childNodes);
  const title = heading?.textContent.trim() ?? '';

  const list = body.querySelector('ul');
  const learnMore = list?.querySelector('a')?.href;
  list?.remove();

  const header = document.createElement('div');
  header.className = 'card-header';
  header.append(decorateIcon(iconCol));
  if (getMenuItems({ href, learnMore }).length) header.append(buildMoreButton(title));

  body.className = 'card-body';

  row.className = 'card';
  row.setAttribute('role', 'listitem');
  if (href) row.dataset.href = href;
  if (learnMore) row.dataset.learnMore = learnMore;
  row.replaceChildren(header, body, buildFooter({ href, title }));
}

function attachMenu(el) {
  let menu;
  let items = [];
  let activeBtn;

  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('.card-more');
    if (!btn) return;
    if (menu?.open && activeBtn === btn) {
      menu.close();
      return;
    }
    const card = btn.closest('.card');
    await loadMenu();
    if (!menu) {
      menu = document.createElement('nx-menu');
      menu.addEventListener('select', ({ detail }) => {
        const item = items.find((i) => i.id === detail?.id);
        if (item) window.open(item.url, '_blank', 'noopener');
      });
      menu.addEventListener('close', () => {
        activeBtn?.setAttribute('aria-expanded', 'false');
        activeBtn = undefined;
      });
      el.after(menu);
    }
    activeBtn?.setAttribute('aria-expanded', 'false');
    items = getMenuItems({ href: card.dataset.href, learnMore: card.dataset.learnMore });
    menu.items = items.map(({ id, label }) => ({ id, label }));
    await menu.updateComplete;
    menu.show({ anchor: btn });
    activeBtn = btn;
    btn.setAttribute('aria-expanded', 'true');
  });
}

const matchesQuery = ({ card, query }) => {
  const text = [...card.querySelectorAll('.card-body h1, .card-body h2, .card-body h3, .card-body h4, .card-body h5, .card-body h6, .card-body p')]
    .map((node) => node.textContent).join(' ').toLowerCase();
  return text.includes(query);
};

// Search across all cards blocks on the page, driven by nx-cards-filter.
function attachSearch(el) {
  document.addEventListener('nx-cards-filter', ({ detail }) => {
    if (!el.isConnected) return;
    const query = (detail?.query ?? '').trim().toLowerCase();
    const cards = [...el.querySelectorAll(':scope > .card')];
    const count = cards.reduce((acc, card) => {
      const match = !query || matchesQuery({ card, query });
      card.hidden = !match;
      return match ? acc + 1 : acc;
    }, 0);
    detail?.results?.push({ section: el.closest('.section') ?? el.parentElement, count });
  });
}

export default function init(el) {
  if (!document.adoptedStyleSheets.includes(style)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];
  }

  el.setAttribute('role', 'list');
  el.querySelectorAll(':scope > div').forEach(decorateCard);
  attachMenu(el);
  attachSearch(el);
  document.dispatchEvent(new CustomEvent('nx-cards-ready'));
}
