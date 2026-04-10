import { getMetadata } from '../scripts/nx.js';

/** Default painted panel surface width (the white column users see inside wrapper margins). */
const PANEL_SURFACE_DEFAULT_PX = 400;
/** Minimum width of the painted panel surface (inside `.panel-wrapper` margins). */
const PANEL_SURFACE_MIN_PX = 240;
/**
 * Desktop `.panel-wrapper` uses `margin-inline: 12px`; the grid sizes `aside`, so
 * track min = surface min + those insets (otherwise ~216px “looks” like the minimum).
 */
const PANEL_WRAPPER_MARGIN_INLINE_PX = 12;

/**
 * Default grid track width (`aside` column): on desktop includes wrapper side margins so
 * the painted surface matches `PANEL_SURFACE_DEFAULT_PX`; on small viewports margins are 0.
 */
export function getDefaultPanelTrackWidthPx() {
  if (typeof window === 'undefined') {
    return PANEL_SURFACE_DEFAULT_PX + 2 * PANEL_WRAPPER_MARGIN_INLINE_PX;
  }
  return window.matchMedia('(min-width: 600px)').matches
    ? PANEL_SURFACE_DEFAULT_PX + 2 * PANEL_WRAPPER_MARGIN_INLINE_PX
    : PANEL_SURFACE_DEFAULT_PX;
}

export function getDefaultPanelWidthCss() {
  return `${getDefaultPanelTrackWidthPx()}px`;
}
/** Desktop grid track min so the painted surface is still `PANEL_SURFACE_MIN_PX` after margins. */
const DESKTOP_PANEL_TRACK_MIN_PX = PANEL_SURFACE_MIN_PX + 2 * PANEL_WRAPPER_MARGIN_INLINE_PX;
/** `main` and any peer side panel **track** each stay at least this wide when you resize. */
const REGION_MIN_WIDTH_PX = PANEL_SURFACE_MIN_PX;
/**
 * Approximate horizontal margin budget (sidenav gap, main/panel `margin-inline`, gutters).
 * Kept in sync-ish with app-frame `styles.css` (~12px rhythm).
 */
const APP_FRAME_WIDTH_MARGIN_BUDGET = 72;

const NAV_WIDTH_PX = 56;

/** Below 600px the shell uses full-bleed panel chrome (`margin: 0` on `.panel-wrapper`). */
function panelTrackMinPx() {
  return window.matchMedia('(min-width: 600px)').matches
    ? DESKTOP_PANEL_TRACK_MIN_PX
    : PANEL_SURFACE_MIN_PX;
}

function parsePanelWidth(aside) {
  const w = aside.dataset.width?.trim();
  if (w && /^\d+(\.\d+)?px$/i.test(w)) return parseFloat(w);
  return aside.getBoundingClientRect().width;
}

/**
 * Max width for this panel’s column: user can grow until `main` and the peer panel (if any)
 * would go below REGION_MIN_WIDTH_PX. No arbitrary hard cap beyond the viewport budget.
 */
function getPanelWidthMaxPx(aside) {
  const inner = window.innerWidth;
  const sidenav = document.body.classList.contains('sidenav-collapsed') ? 0 : NAV_WIDTH_PX;
  const before = document.body.querySelector('aside.panel[data-position="before"]:not([hidden])');
  const after = document.body.querySelector('aside.panel[data-position="after"]:not([hidden])');
  const isBefore = aside.dataset.position === 'before';

  const trackMin = panelTrackMinPx();

  let peerOtherPx = 0;
  if (isBefore) {
    if (after && after !== aside) {
      peerOtherPx = Math.max(trackMin, parsePanelWidth(after));
    }
  } else if (before && before !== aside) {
    peerOtherPx = Math.max(trackMin, parsePanelWidth(before));
  }

  const reserved = sidenav + peerOtherPx + REGION_MIN_WIDTH_PX + APP_FRAME_WIDTH_MARGIN_BUDGET;
  const fromLayout = inner - reserved;
  return Math.max(trackMin, fromLayout);
}

function applyPanelWidth(aside, px) {
  const max = getPanelWidthMaxPx(aside);
  const min = panelTrackMinPx();
  const clamped = `${Math.max(min, Math.min(max, Math.round(px)))}px`;
  aside.dataset.width = clamped;
  aside.style.width = clamped;
}

/** If viewport or peer panels changed, clamp stored widths so layout stays valid. */
export function clampAllPanelWidthsToLayout() {
  document.body.querySelectorAll('aside.panel:not([hidden])').forEach((aside) => {
    const el = /** @type {HTMLElement} */ (aside);
    applyPanelWidth(el, parsePanelWidth(el));
  });
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
  const sidenavCollapsed = body.classList.contains('sidenav-collapsed');

  const getWidth = (el) => {
    const w = el?.dataset.width?.trim();
    return w && /^\d+(\.\d+)?px$/i.test(w) ? w : 'minmax(0, auto)';
  };

  const header = ['header'];
  const content = ['sidenav'];
  const columns = [sidenavCollapsed ? '0px' : 'var(--s2-nav-width)'];

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

const RESIZE_ACTIVE_CLASS = 'nx-panel-resize-active';
const PANEL_RESIZING_CLASS = 'nx-panel-resizing';

function resizePointerDown(downEvent) {
  const handle = /** @type {HTMLButtonElement} */ (downEvent.currentTarget);
  const aside = handle.closest('aside.panel');
  if (!aside || downEvent.button !== 0) return;

  downEvent.preventDefault();

  const deltaSign = aside.dataset.position === 'before' ? 1 : -1;

  handle.setPointerCapture(downEvent.pointerId);
  const startX = downEvent.clientX;
  const startW = parsePanelWidth(aside);
  const prevUserSelect = document.body.style.userSelect;
  document.body.style.userSelect = 'none';
  document.body.classList.add(RESIZE_ACTIVE_CLASS);
  aside.classList.add(PANEL_RESIZING_CLASS);

  let rafId = 0;
  let pendingDx = 0;

  const flushMove = () => {
    rafId = 0;
    applyPanelWidth(aside, startW + deltaSign * pendingDx);
    setPanelsGrid();
  };

  const onPointerMove = (moveEvent) => {
    pendingDx = moveEvent.clientX - startX;
    if (!rafId) {
      rafId = requestAnimationFrame(flushMove);
    }
  };

  const captureId = downEvent.pointerId;

  let ended = false;
  function endResize() {
    if (ended) return;
    ended = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    flushMove();
    document.body.style.userSelect = prevUserSelect;
    document.body.classList.remove(RESIZE_ACTIVE_CLASS);
    aside.classList.remove(PANEL_RESIZING_CLASS);
    handle.removeEventListener('pointermove', onPointerMove);
    handle.removeEventListener('pointerup', endResize);
    handle.removeEventListener('pointercancel', endResize);
    handle.removeEventListener('lostpointercapture', endResize);
    try {
      handle.releasePointerCapture(captureId);
    } catch {
      /* already released */
    }
    savePanelState(aside.dataset.position, {
      width: aside.dataset.width,
      fragment: aside.dataset.fragment,
    });
  }

  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', endResize);
  handle.addEventListener('pointercancel', endResize);
  handle.addEventListener('lostpointercapture', endResize);
}

function resetPanelTrackToDefaultWidth(aside) {
  applyPanelWidth(aside, getDefaultPanelTrackWidthPx());
  setPanelsGrid();
  savePanelState(aside.dataset.position, {
    width: aside.dataset.width,
    fragment: aside.dataset.fragment,
  });
}

const PANEL_RAISED_CLASS = 'nx-panel-raised';
const MAIN_RAISED_CLASS = 'nx-main-raised';

function panelWrapperFromAside(aside) {
  return aside?.querySelector(':scope > .panel-wrapper') ?? null;
}

function lowerAppFrameMain() {
  document.querySelector('main')?.classList.remove(MAIN_RAISED_CLASS);
}

function raiseAppFrameMain() {
  document.querySelector('main')?.classList.add(MAIN_RAISED_CLASS);
}

/** If no side panel is elevated, treat the canvas `main` as active (center column). */
function syncMainRaisedIfNoPanelRaised() {
  if (getMetadata('template') !== 'app-frame') return;
  const anyPanelRaised = document.querySelector(
    `aside.panel:not([hidden]) .panel-wrapper.${PANEL_RAISED_CLASS}`,
  );
  if (!anyPanelRaised) {
    raiseAppFrameMain();
  }
}

/** Set elevated shadow on one panel only (or clear all when `panelAside` is null). */
function setActivePanelAside(panelAside) {
  if (panelAside) {
    lowerAppFrameMain();
  }
  document.querySelectorAll('aside.panel:not([hidden])').forEach((aside) => {
    const w = panelWrapperFromAside(aside);
    if (!w) return;
    if (panelAside && aside === panelAside) {
      w.classList.add(PANEL_RAISED_CLASS);
    } else {
      w.classList.remove(PANEL_RAISED_CLASS);
    }
  });
}

function findPanelAsideInComposedPath(path) {
  for (const node of path) {
    if (
      node instanceof Element
      && node.localName === 'aside'
      && node.classList.contains('panel')
      && !node.hidden
    ) {
      return /** @type {HTMLElement} */ (node);
    }
  }
  return null;
}

function composedPathIncludesMain(path) {
  for (const node of path) {
    if (node instanceof Element && node.localName === 'main') return true;
  }
  return false;
}

function onDocumentPointerDownForSurfaceRaise(event) {
  if (event.button !== 0) return;
  if (getMetadata('template') !== 'app-frame') return;
  const path = event.composedPath();
  const hitPanel = findPanelAsideInComposedPath(path);
  if (hitPanel) {
    setActivePanelAside(hitPanel);
    return;
  }
  if (composedPathIncludesMain(path)) {
    setActivePanelAside(null);
    raiseAppFrameMain();
  }
}

let panelRaisePointerHookInstalled = false;
let panelLayoutResizeHookInstalled = false;

function ensurePanelLayoutClampOnResize() {
  if (panelLayoutResizeHookInstalled || typeof window === 'undefined') return;
  panelLayoutResizeHookInstalled = true;
  window.addEventListener('resize', () => {
    if (getMetadata('template') !== 'app-frame') return;
    clampAllPanelWidthsToLayout();
    setPanelsGrid();
  });
}

function ensurePanelRaisePointerHook() {
  if (panelRaisePointerHookInstalled || typeof document === 'undefined') return;
  panelRaisePointerHookInstalled = true;
  document.addEventListener('pointerdown', onDocumentPointerDownForSurfaceRaise, true);
}

/** Default: center `main` is elevated until a side panel is clicked (app-frame only). */
export function ensureAppFrameSurfaceElevation() {
  if (getMetadata('template') !== 'app-frame') return;
  ensurePanelRaisePointerHook();
  ensurePanelLayoutClampOnResize();
  syncMainRaisedIfNoPanelRaised();
}

/** Walk composedPath up to `wrapper`; if we hit a real control first, skip panel focus. */
function panelPointerShouldFocusWrapper(event, wrapper) {
  const path = event.composedPath();
  const wrapIdx = path.indexOf(wrapper);
  if (wrapIdx === -1) return false;
  for (let i = 0; i < wrapIdx; i += 1) {
    const node = path[i];
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = /** @type {Element} */ (node);
      if (
        el.matches(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"]',
        )
      ) {
        return false;
      }
      if (el !== wrapper && el.matches('[tabindex]')) {
        const ti = Number.parseInt(el.getAttribute('tabindex') ?? '', 10);
        if (!Number.isNaN(ti) && ti >= 0) return false;
      }
    }
  }
  return true;
}

function buildPanelDOM(aside) {
  const edge = aside.dataset.position === 'before' ? 'trailing' : 'leading';

  const wrapper = document.createElement('div');
  wrapper.className = 'panel-wrapper';
  wrapper.tabIndex = 0;
  wrapper.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (!panelPointerShouldFocusWrapper(e, wrapper)) return;
    if (document.activeElement === wrapper) return;
    wrapper.focus({ preventScroll: true });
  });

  const shell = document.createElement('div');
  shell.className = 'panel-shell';

  const body = document.createElement('div');
  body.className = 'panel-body';

  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = `panel-resize-handle panel-resize-handle-${edge}`;
  handle.setAttribute('aria-label', 'Resize panel. Double-click to restore default width.');
  handle.addEventListener('pointerdown', resizePointerDown);
  handle.addEventListener('dblclick', (e) => {
    e.preventDefault();
    const panelAside = handle.closest('aside.panel');
    if (!panelAside) return;
    resetPanelTrackToDefaultWidth(panelAside);
  });

  shell.append(body);
  wrapper.append(shell, handle);
  aside.append(wrapper);
}

export function createPanel({
  width = getDefaultPanelWidthCss(),
  beforeMain = false,
  content,
  fragment,
} = {}) {
  const aside = document.createElement('aside');
  aside.classList.add('panel');
  aside.dataset.width = width;
  aside.style.width = width;
  const position = beforeMain ? 'before' : 'after';
  aside.dataset.position = position;
  if (fragment) aside.dataset.fragment = fragment;

  buildPanelDOM(aside);

  if (content) aside.querySelector('.panel-body').append(content);

  if (beforeMain) {
    document.querySelector('main').before(aside);
  } else {
    document.querySelector('main').after(aside);
  }

  ensurePanelRaisePointerHook();
  ensurePanelLayoutClampOnResize();
  applyPanelWidth(aside, parsePanelWidth(aside));
  setPanelsGrid();
  setActivePanelAside(aside);

  savePanelState(position, {
    width: aside.dataset.width,
    fragment: fragment ?? aside.dataset.fragment,
  });

  return aside;
}

export function hidePanel(aside) {
  panelWrapperFromAside(aside)?.classList.remove(PANEL_RAISED_CLASS);
  removePanelState(aside.dataset.position);
  aside.hidden = true;
  setPanelsGrid();
  syncMainRaisedIfNoPanelRaised();
}

export function unhidePanel(aside) {
  aside.hidden = false;
  ensurePanelRaisePointerHook();
  ensurePanelLayoutClampOnResize();
  applyPanelWidth(aside, parsePanelWidth(aside));
  setPanelsGrid();
  savePanelState(aside.dataset.position, {
    width: aside.dataset.width,
    fragment: aside.dataset.fragment,
  });
  setActivePanelAside(aside);
}

export { getPanelStore };

export function showPanel(opts) {
  return createPanel(opts);
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

export async function openPanelWithFragment({
  width = getDefaultPanelWidthCss(),
  beforeMain = false,
  fragment,
} = {}) {
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
