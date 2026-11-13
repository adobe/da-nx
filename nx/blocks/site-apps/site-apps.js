import {
  DA_ADMIN, hashChange, loadStyle, withSiteHash,
} from '../../../nx2/utils/utils.js';
import { daFetch } from '../../../nx2/utils/api.js';
import { getConfig, loc } from '../../../nx2/scripts/nx.js';
import '../../../nx2/blocks/shared/action-card/action-card.js';
import { iconSvg } from '../../../nx2/blocks/shared/utils/icons.js';
import { attachCardSearch } from '../../../nx2/blocks/shared/utils/card-search.js';

const style = await loadStyle(import.meta.url);

if (!document.adoptedStyleSheets.includes(style)) {
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];
}

const ref = new URLSearchParams(window.location.search).get('ref') || 'main';

function getIsAppAllowed(cardRef) {
  const pluginRef = cardRef || 'main';

  // Always return true if pluginRef is main
  if (pluginRef === 'main') return true;

  // Allow all branches on dev
  if (ref === 'dev') return true;

  // Allow if pluginRef matches query param ref
  if (pluginRef === ref) return true;

  return false;
}

// Apps without a configured image get a generic Spectrum icon on a light blue tile.
const FALLBACK_ICON = 's2-icon-tools-20-n';
const FALLBACK_TINT = '#E5F0FE';

function getCard({ title, description, path, image }) {
  const card = document.createElement('nx-action-card');
  card.setAttribute('role', 'listitem');
  card.heading = title ?? '';
  card.description = description ?? '';
  if (image) {
    // Admins can configure any image format, so it goes into the card's icon slot as <img>.
    const img = document.createElement('img');
    img.slot = 'icon';
    img.src = image;
    img.alt = '';
    img.loading = 'lazy';
    card.append(img);
  } else {
    card.tint = FALLBACK_TINT;
    card.append(iconSvg({ href: `${getConfig().codeBase}/img/icons/${FALLBACK_ICON}.svg`, slot: 'icon' }));
  }
  // Site apps always get the page's site path as hash (e.g. `#/org/site`).
  const sync = ({ fullpath } = {}) => {
    if (path) card.action = withSiteHash({ href: path, fullpath });
  };
  if (path) card.actionLabel = loc`Open`;
  const extra = document.createElement('span');
  extra.slot = 'extra';
  extra.textContent = loc`By Admin`;
  card.append(extra);
  return { card, sync };
}

// Renders the allowed apps as <nx-action-card>s and joins the cards-filter search.
export function renderApps({ el, apps }) {
  el.setAttribute('role', 'list');
  const allowed = (apps ?? []).filter((app) => getIsAppAllowed(app.ref || 'main'));
  const items = allowed.map(getCard);
  el.replaceChildren(...items.map(({ card }) => card));
  hashChange.subscribe((details) => {
    if (el.isConnected) items.forEach(({ sync }) => sync(details ?? {}));
  });
  attachCardSearch(el);
}

function removeSection(el) {
  el.closest('.section').remove();
}

export default async function init(el) {
  if (!window.location.hash) {
    removeSection(el);
    return;
  }
  el.innerHTML = '';
  const [org, repo] = window.location.hash.slice(2).split('/');
  try {
    const resp = await daFetch({ url: `${DA_ADMIN}/config/${org}/${repo}/` });
    const json = await resp.json();
    if (!json.apps) {
      removeSection(el);
      return;
    }

    renderApps({ el, apps: json.apps.data });
  } catch {
    removeSection(el);
  }
}
