// Inlined to avoid a cycle with nx.js — panel.js is imported from nx.js's
// top-level await, which would otherwise deadlock against the static import.
function getMetadata(name) {
  const attr = name && name.includes(':') ? 'property' : 'name';
  const meta = document.head.querySelector(`meta[${attr}="${name}"]`);
  return meta && meta.content;
}

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

const VALID_WIDTH = /^\d+(\.\d+)?px$/i;

export function setPanelsGrid() {
  const { body } = document;
  if (getMetadata('template') !== 'app-frame') return;

  const before = body.querySelector('aside.panel[data-position="before"]:not([hidden])');
  const after = body.querySelector('aside.panel[data-position="after"]:not([hidden])');
  const root = document.documentElement;

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

  root.style.setProperty('--app-frame-areas', `"${header.join(' ')}" var(--s2-nav-height) "${content.join(' ')}" 1fr`);
  root.style.setProperty('--app-frame-columns', columns.join(' '));
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

export function hidePanel(aside) {
  removePanelState(aside.dataset.position);
  aside.hidden = true;
  setPanelsGrid();
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

  // Allow any consumer inside the panel to close it by firing nx-panel-close.
  aside.addEventListener('nx-panel-close', () => hidePanel(aside));
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

export function showPanel(aside) {
  aside.hidden = false;
  savePanelState(aside.dataset.position, {
    width: aside.dataset.width,
    fragment: aside.dataset.fragment,
  });
  setPanelsGrid();
}

// unhidePanel: legacy alias for showPanel, kept pending a full rename across all callers.
export { getPanelStore, showPanel as unhidePanel };

function mountPanel(opts) {
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
  return mountPanel({ width, beforeMain, content, fragment: persistedFragment });
}

// Build the panel chrome for a position (no content). Used by mountPanelOutlines
// to reserve grid space synchronously, before the slow content imports finish.
function createPanelOutline({ position, width, fragment }) {
  const aside = document.createElement('aside');
  aside.classList.add('panel');
  aside.dataset.width = width;
  aside.style.width = width;
  aside.dataset.position = position;
  if (fragment) aside.dataset.fragment = fragment;
  buildPanelDOM(aside);
  const main = document.querySelector('main');
  if (!main) return null;
  if (position === 'before') main.before(aside);
  else main.after(aside);
  return aside;
}

export function mountPanelOutlines() {
  if (getMetadata('template') !== 'app-frame') return;
  const store = getPanelStore();
  for (const position of ['before', 'after']) {
    const entry = store[position];
    const width = entry?.width?.trim();
    if (width && VALID_WIDTH.test(width)
        && !document.querySelector(`aside.panel[data-position="${position}"]`)) {
      createPanelOutline({ position, width, fragment: entry.fragment });
    }
  }
  setPanelsGrid();
}

async function fillPanelOutline(aside, getContent) {
  const body = aside.querySelector('.panel-body');
  if (!body || body.firstChild || !getContent) return;
  const content = await getContent();
  if (content) body.append(content);
}

export async function restorePanels() {
  const panels = getPanelStore();
  if (!panels.before && !panels.after) return;
  for (const [position, { width, fragment }] of Object.entries(panels)) {
    if (fragment) {
      const existing = document.querySelector(`aside.panel[data-position="${position}"]`);
      if (existing) {
        await fillPanelOutline(existing, async () => (await loadPanelContent(fragment)).content);
      } else {
        const { content, fragment: frag } = await loadPanelContent(fragment);
        if (content) {
          const beforeMain = position === 'before';
          mountPanel({ width, beforeMain, content, fragment: frag });
        }
      }
    }
  }
  document.dispatchEvent(new CustomEvent('nx-panels-restored'));
}

export async function openPanel({ position, width = '400px', getContent } = {}) {
  const existing = document.querySelector(`aside.panel[data-position="${position}"]`);
  if (existing && !existing.hidden) {
    await fillPanelOutline(existing, getContent);
    return existing;
  }
  if (existing?.hidden) {
    showPanel(existing);
    await fillPanelOutline(existing, getContent);
    return existing;
  }

  const beforeMain = position === 'before';
  const content = await getContent?.();
  return mountPanel({ width, beforeMain, content });
}
