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

/**
 * Whether a section's panel was left open last time. Callers still decide
 * themselves whether/how to reopen it.
 */
export function wasPanelOpen(section) {
  return !!getPanelStore()[section];
}

function savePanelState(section, { width }) {
  const store = getPanelStore();
  store[section] = { width };
  localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(store));
}

function removePanelState(section) {
  const store = getPanelStore();
  delete store[section];
  localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(store));
}

function setPanelsGrid() {
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
    savePanelState(aside.dataset.section, { width: aside.dataset.width });
  };

  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerUp);
}

function hidePanel(aside) {
  removePanelState(aside.dataset.section);
  aside.hidden = true;
  setPanelsGrid();
}

export const PANEL_EVENT = Object.freeze({
  // { section?: string } — omitted when a panel's own chrome closes itself
  // (bubbles to the aside it's inside, no section needed); include one to
  // close a specific panel from anywhere without holding a DOM reference.
  CLOSE: 'nx-panel-close',

  // fire from anywhere to open a section, optionally a specific item within
  // it (e.g. a tool-panel view, a BYO extension's id). `options` is opaque to
  // the registry — it's forwarded as-is to the section's own `onShow`, which
  // decides what (if anything) to do with it.
  OPEN: 'nx-panel-open', // { section: string, id?: string, options?: unknown }
});

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

  // Allow any consumer inside the panel to close it by firing PANEL_EVENT.CLOSE.
  aside.addEventListener(PANEL_EVENT.CLOSE, () => hidePanel(aside));
}
function createPanel({
  width = '400px', beforeMain = false, content, section,
} = {}) {
  const aside = document.createElement('aside');
  aside.classList.add('panel');
  aside.dataset.width = width;
  aside.style.width = width;
  aside.dataset.position = beforeMain ? 'before' : 'after';
  if (section) aside.dataset.section = section;

  buildPanelDOM(aside);

  if (content) aside.querySelector('.panel-body').append(content);

  savePanelState(section, { width });

  if (beforeMain) {
    document.querySelector('main').before(aside);
  } else {
    document.querySelector('main').after(aside);
  }

  return aside;
}

function showPanel(aside) {
  aside.hidden = false;
  savePanelState(aside.dataset.section, { width: aside.dataset.width });
  setPanelsGrid();
}

function mountPanel(opts) {
  const aside = createPanel(opts);
  setPanelsGrid();
  return aside;
}

/**
 * @param {{
 *   position: 'before'|'after',
 *   width?: string,
 *   getContent: () => Promise<Element>,
 *   section: string,
 * }} opts
 */
async function openPanel({
  position, width = '400px', getContent, section,
} = {}) {
  const existing = document.querySelector(`aside.panel[data-position="${position}"]`);
  if (existing && !existing.hidden) return existing;
  if (existing?.hidden) {
    showPanel(existing);
    return existing;
  }

  const beforeMain = position === 'before';
  const content = await getContent?.();
  return mountPanel({
    width, beforeMain, content, section,
  });
}

const panelSections = new Map();

// Called once per host page to declare a section it owns — see docs/workspace.md
// ("Side panels") for the full config contract.
export function registerPanelSection(name, config) {
  panelSections.set(name, config);
}

export function getSectionAtPosition(position) {
  for (const [name, config] of panelSections) {
    if (config.position === position) return name;
  }
  return undefined;
}

async function showPanelSection(name, id, options) {
  const config = panelSections.get(name);
  if (!config) return undefined;
  const width = getPanelStore()[name]?.width ?? config.width;
  const aside = await openPanel({
    position: config.position, width, getContent: config.getContent, section: name,
  });
  await config.onShow?.(aside, id, options);
  return aside;
}

function closePanelSection(name) {
  const config = panelSections.get(name);
  if (!config) return;
  const aside = document.querySelector(`aside.panel[data-position="${config.position}"]`);
  if (aside && !aside.hidden) hidePanel(aside);
}

document.addEventListener(PANEL_EVENT.OPEN, ({ detail }) => {
  const { section, id, options } = detail ?? {};
  if (section) showPanelSection(section, id, options);
});

document.addEventListener(PANEL_EVENT.CLOSE, ({ detail }) => {
  const { section } = detail ?? {};
  if (section) closePanelSection(section);
});
