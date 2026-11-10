import { DA_ADMIN, loadStyle } from '../../../nx2/utils/utils.js';
import { daFetch } from '../../../nx2/utils/api.js';
import { loc } from '../../../nx2/scripts/nx.js';
import '../../../nx2/blocks/shared/tool-card/tool-card.js';
import { attachCardSearch } from '../../../nx2/blocks/shared/tool-card/search.js';

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

function getCard({ title, description, path, image }) {
  const card = document.createElement('nx-tool-card');
  card.setAttribute('role', 'listitem');
  card.heading = title ?? '';
  card.description = description ?? '';
  card.byline = loc`By Admin`;
  if (path) card.href = path;
  if (image) card.image = image;
  return card;
}

// Renders the allowed apps as <nx-tool-card>s and joins the cards-filter search.
export function renderApps({ el, apps }) {
  el.setAttribute('role', 'list');
  const allowed = (apps ?? []).filter((app) => getIsAppAllowed(app.ref || 'main'));
  el.replaceChildren(...allowed.map(getCard));
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
