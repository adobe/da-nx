import { DA_ADMIN } from '../../utils/utils.js';
import { daFetch } from '../../utils/api.js';
import { loadHrefSvg } from '../../utils/svg.js';
import { getConfig } from '../../scripts/nx.js';

const { nxBase } = getConfig();
const TOGGLE_MAP = { '/edit': '/canvas', '/canvas': '/edit', '/browse': '/', '/': '/browse' };
const cache = {};

async function hasFlag(org, site) {
  const key = `${org}/${site}`;
  cache[key] ??= daFetch({ url: `${DA_ADMIN}/config/${org}/${site}/` })
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      const sheet = json?.data?.data ?? json?.data;
      return !!sheet?.find(({ key: k, value }) => k === 'nx-toggle' && value === 'true');
    })
    .catch(() => false);
  return cache[key];
}

async function makeToggle() {
  const { pathname } = window.location;
  const label = (pathname === '/canvas' || pathname === '/browse') ? 'Old UI' : 'New UI';
  const li = document.createElement('li');
  li.innerHTML = `<button class="nx-toggle"><span>${label}</span></button>`;
  const btn = li.querySelector('button');
  const icon = await loadHrefSvg(`${nxBase}/img/icons/S2_Icon_Layout_20_N.svg`);
  if (icon) btn.prepend(icon);
  btn.addEventListener('click', () => {
    const { pathname: p, hash: h, search } = window.location;
    if (TOGGLE_MAP[p]) window.location.href = `${TOGGLE_MAP[p]}${search}${h}`;
  });
  return li;
}

export default function setupToggle(getActions) {
  const check = async () => {
    const [, org, site] = window.location.hash.split('/');
    const actions = await getActions();
    if (!org || !site) {
      actions?.querySelector('li:has(.nx-toggle)')?.remove();
      return;
    }
    const flag = await hasFlag(org, site);
    const existing = actions?.querySelector('.nx-toggle');
    if (flag && !existing && actions) actions.prepend(await makeToggle());
    else if (!flag && existing) existing.closest('li').remove();
  };

  check();
  window.addEventListener('hashchange', check);
}
