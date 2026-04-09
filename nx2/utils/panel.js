import { getMetadata } from '../scripts/nx.js';

const PANEL_WIDTH_MIN = 120;
const PANEL_WIDTH_MAX = () => Math.min(1600, window.innerWidth * 0.4);

function parsePanelWidth(aside) {
  const w = aside.dataset.width?.trim();
  if (w && /^\d+(\.\d+)?px$/i.test(w)) return parseFloat(w);
  return aside.getBoundingClientRect().width;
}

function applyPanelWidth(aside, px) {
  const clamped = `${Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX(), Math.round(px)))}px`;
  aside.dataset.width = clamped;
  aside.style.width = clamped;
}

const PANEL_STORAGE_KEY = 'nx-panels';

function getPanelStore() {
  try {
    return JSON.parse(localStorage.getItem(PANEL_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function savePanelState(position, { width, fragment }) {
  const store = getPanelStore();
  store[position] = { width, fragment };
  localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(store));
}

function removePanelState(position) {
  const store = getPanelStore();
  delete store[position];
  localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(store));
}

export function setPanelsGrid() {
  const { body } = document;
  if (getMetadata('template') !== 'app-frame') return;

  const before = body.querySelector('aside.panel[data-position="before"]:not([hidden])');
  const after = body.querySelector('aside.panel[data-position="after"]:not([hidden])');

  const getWidth = (el) => {
    const w = el?.dataset.width?.trim();
    return w ? `min(${w}, 40vw)` : 'minmax(0, auto)';
  };

  const header = ['header'];
  const content = ['sidenav'];
  const columns = ['var(--s2-nav-width)'];

  if (before) {
    before.style.gridArea = 'panel-before';
    header.push('header');
    content.push('panel-before');
    columns.push(getWidth(before));
  }

  header.push('header');
  content.push('main');
  columns.push('1fr');

  if (after) {
    after.style.gridArea = 'panel-after';
    header.push('header');
    content.push('panel-after');
    columns.push(getWidth(after));
  }

  body.style.setProperty('--app-frame-areas', `"${header.join(' ')}" var(--s2-nav-height) "${content.join(' ')}" 1fr`);
  body.style.setProperty('--app-frame-columns', columns.join(' '));
}

function resizePointerDown(downEvent) {
  const handle = downEvent.currentTarget;
  const aside = handle.closest('aside.panel');
  if (!aside || downEvent.button !== 0) return;
  const deltaSign = aside.dataset.position === 'before' ? 1 : -1;

  handle.setPointerCapture(downEvent.pointerId);
  const startX = downEvent.clientX;
  const startW = parsePanelWidth(aside);
  const prevUserSelect = document.body.style.userSelect;
  document.body.style.userSelect = 'none';

  const onPointerMove = (moveEvent) => {
    const dx = moveEvent.clientX - startX;
    applyPanelWidth(aside, startW + deltaSign * dx);
    setPanelsGrid();
  };

  const onPointerUp = (upEvent) => {
    handle.releasePointerCapture(upEvent.pointerId);
    document.body.style.userSelect = prevUserSelect;
    handle.removeEventListener('pointermove', onPointerMove);
    handle.removeEventListener('pointerup', onPointerUp);
    handle.removeEventListener('pointercancel', onPointerUp);
    savePanelState(aside.dataset.position, {
      width: aside.dataset.width,
      fragment: aside.dataset.fragment,
    });
  };

  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerUp);
}

function buildPanelDOM(aside) {
  const edge = aside.dataset.position === 'before' ? 'trailing' : 'leading';

  const wrapper = document.createElement('div');
  wrapper.className = 'panel-wrapper';

  const shell = document.createElement('div');
  shell.className = 'panel-shell';

  const body = document.createElement('div');
  body.className = 'panel-body';

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = `panel-resize-handle panel-resize-handle-${edge}`;
  handle.setAttribute('aria-label', 'Resize panel');
  handle.addEventListener('pointerdown', resizePointerDown);

  shell.append(body);
  wrapper.append(shell, handle);
  aside.append(wrapper);
}

export function createPanel({ width = '400px', beforeMain = false, content, fragment } = {}) {
  const aside = document.createElement('aside');
  aside.classList.add('panel');
  aside.dataset.width = width;
  aside.style.width = width;
  const position = beforeMain ? 'before' : 'after';
  aside.dataset.position = position;
  if (fragment) aside.dataset.fragment = fragment;

  buildPanelDOM(aside);

  if (content) aside.querySelector('.panel-body').append(content);

  savePanelState(position, { width, fragment });

  if (beforeMain) {
    document.querySelector('main').before(aside);
  } else {
    document.querySelector('main').after(aside);
  }

  return aside;
}

export function hidePanel(aside) {
  removePanelState(aside.dataset.position);
  aside.hidden = true;
  setPanelsGrid();
}

export function unhidePanel(aside) {
  aside.hidden = false;
  savePanelState(aside.dataset.position, {
    width: aside.dataset.width,
    fragment: aside.dataset.fragment,
  });
  setPanelsGrid();
}

export { getPanelStore };

export function showPanel(opts) {
  const aside = createPanel(opts);
  setPanelsGrid();
  return aside;
}

export async function loadPanelContent(value) {
  if (!value) return { content: null, fragment: undefined };
  if (value.includes('/fragments/')) {
    const { loadFragment } = await import('../blocks/fragment/fragment.js');
    const content = await loadFragment(value);
    return { content, fragment: value };
  }
  const mod = await import(`../../nx/blocks/${value}/${value}.js`);
  return { content: await mod.getPanel(), fragment: undefined };
}

export async function openPanelWithFragment({ width = '400px', beforeMain = false, fragment } = {}) {
  const { content, fragment: persistedFragment } = await loadPanelContent(fragment);
  if (!content) return undefined;
  return showPanel({ width, beforeMain, content, fragment: persistedFragment });
}

export async function restorePanels() {
  const panels = getPanelStore();
  if (!panels.before && !panels.after) return;
  for (const [position, { width, fragment }] of Object.entries(panels)) {
    if (fragment) {
      const { content, fragment: frag } = await loadPanelContent(fragment);
      if (content) {
        const beforeMain = position === 'before';
        showPanel({ width, beforeMain, content, fragment: frag });
      }
    }
  }
  document.dispatchEvent(new CustomEvent('nx-panels-restored'));
}
