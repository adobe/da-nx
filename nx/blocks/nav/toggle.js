import { DA_ORIGIN } from '../../public/utils/constants.js';
import { daFetch } from '../../utils/daFetch.js';

const TOGGLE_MAP = { '/edit': '/canvas', '/canvas': '/edit', '/browse': '/', '/': '/browse' };
const cache = {};

async function hasFlag(org, site) {
  const key = `${org}/${site}`;
  cache[key] ??= daFetch(`${DA_ORIGIN}/config/${org}/${site}/`)
    .then((r) => (r?.ok ? r.json() : null))
    .then((json) => {
      const sheet = json?.data?.data ?? json?.data;
      return !!sheet?.find(({ key: k, value }) => k === 'nx-toggle' && value === 'true');
    })
    .catch(() => false);
  return cache[key];
}

export default function addToggle(navActions) {
  const check = async () => {
    const existing = navActions.querySelector('.nx-nav-toggle');
    const [, org, site] = window.location.hash.split('/');
    if (!org || !site) {
      existing?.remove();
      return;
    }

    const flag = await hasFlag(org, site);
    if (flag && !existing) {
      const { pathname } = window.location;
      const label = (pathname === '/canvas' || pathname === '/browse') ? 'Old UI' : 'New UI';
      const btn = document.createElement('button');
      btn.className = 'nx-nav-toggle';
      btn.innerHTML = `<svg class="icon"><use href="#S2IconLayout20N-icon"/></svg><span>${label}</span>`;
      btn.addEventListener('click', () => {
        const { pathname: p, hash: h, search } = window.location;
        if (TOGGLE_MAP[p]) window.location.href = `${TOGGLE_MAP[p]}${search}${h}`;
      });
      navActions.prepend(btn);
    } else if (!flag && existing) {
      existing.remove();
    }
  };

  check();
  window.addEventListener('hashchange', check);
}
