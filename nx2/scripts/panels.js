function getPanels(el = document.body) {
  const beforeMain = [];
  const afterMain = [];

  let pastMain = false;
  el.querySelectorAll('aside.panel, main').forEach((panel) => {
    if (panel.tagName === 'MAIN') {
      pastMain = true;
      return;
    }

    if (pastMain) {
      afterMain.push(panel);
    } else {
      beforeMain.push(panel);
    }
  });

  return { beforeMain, afterMain };
}

function panelGridName(prefix, index) {
  return `${prefix}${index}`;
}

function panelColumnTrack(panel) {
  const w = panel.dataset.width?.trim();
  return w || 'minmax(0, auto)';
}

const PANEL_WIDTH_MIN = 120;
const PANEL_WIDTH_MAX = 1600;

function clearPanelResizeHandles(root) {
  root.querySelectorAll('aside.panel .panel-resize-handle').forEach((h) => h.remove());
}

function parsePanelWidthPx(panel) {
  const w = panel.dataset.width?.trim();
  if (w && /^\d+(\.\d+)?px$/i.test(w)) {
    return parseFloat(w);
  }
  return panel.getBoundingClientRect().width;
}

function clampPanelWidth(px) {
  return Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, Math.round(px)));
}

function applyPanelWidthPx(panel, px) {
  panel.dataset.width = `${clampPanelWidth(px)}px`;
}

/** Updates grid template and panel grid areas only (no resize handles). */
function refreshAppFrameGrid() {
  const { body } = document;
  if (!body.classList.contains('app-frame')) return;

  const { beforeMain, afterMain } = getPanels(body);

  if (!beforeMain.length && !afterMain.length) {
    body.style.removeProperty('--app-frame-areas');
    body.style.removeProperty('--app-frame-columns');
    body.querySelectorAll(':scope > aside.panel').forEach((el) => {
      el.style.removeProperty('grid-area');
    });
    return;
  }

  const colCount = 1 + beforeMain.length + 1 + afterMain.length;
  const headerRow = Array(colCount).fill('header').join(' ');
  const contentRow = [
    'sidenav',
    ...beforeMain.map((_, i) => panelGridName('nx-pb-', i)),
    'main',
    ...afterMain.map((_, i) => panelGridName('nx-pa-', i)),
  ].join(' ');

  beforeMain.forEach((el, i) => {
    el.style.gridArea = panelGridName('nx-pb-', i);
  });
  afterMain.forEach((el, i) => {
    el.style.gridArea = panelGridName('nx-pa-', i);
  });

  const areas = `"${headerRow}" var(--s2-nav-height) "${contentRow}" 1fr`;
  const columns = [
    'var(--s2-nav-width)',
    ...beforeMain.map((el) => panelColumnTrack(el)),
    '1fr',
    ...afterMain.map((el) => panelColumnTrack(el)),
  ].join(' ');

  body.style.setProperty('--app-frame-areas', areas);
  body.style.setProperty('--app-frame-columns', columns);
}

function bindPanelResize(panel, { deltaSign }) {
  const onPointerDown = (downEvent) => {
    if (downEvent.button !== 0) return;
    const handle = downEvent.currentTarget;
    handle.setPointerCapture(downEvent.pointerId);
    const startX = downEvent.clientX;
    const startW = parsePanelWidthPx(panel);
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    const onPointerMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      applyPanelWidthPx(panel, startW + deltaSign * dx);
      refreshAppFrameGrid();
    };

    const onPointerUp = (upEvent) => {
      handle.releasePointerCapture(upEvent.pointerId);
      document.body.style.userSelect = prevUserSelect;
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', onPointerUp);
      handle.removeEventListener('pointercancel', onPointerUp);
    };

    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('pointercancel', onPointerUp);
  };

  return onPointerDown;
}

function syncPanelResizeHandles(beforeMain, afterMain) {
  beforeMain.forEach((panel) => {
    const trail = document.createElement('button');
    trail.type = 'button';
    trail.className = 'panel-resize-handle panel-resize-handle-trailing';
    trail.setAttribute('aria-label', 'Resize panel');
    trail.addEventListener('pointerdown', bindPanelResize(panel, { deltaSign: 1 }));
    panel.append(trail);
  });

  afterMain.forEach((panel) => {
    const lead = document.createElement('button');
    lead.type = 'button';
    lead.className = 'panel-resize-handle panel-resize-handle-leading';
    lead.setAttribute('aria-label', 'Resize panel');
    lead.addEventListener('pointerdown', bindPanelResize(panel, { deltaSign: -1 }));
    panel.append(lead);
  });
}

export function setPanelsGrid() {
  const { body } = document;
  clearPanelResizeHandles(body);
  refreshAppFrameGrid();

  if (!body.classList.contains('app-frame')) return;

  const { beforeMain, afterMain } = getPanels(body);
  if (beforeMain.length || afterMain.length) {
    syncPanelResizeHandles(beforeMain, afterMain);
  }
}

export function showPanel(name, { width = '200px', beforeMain = false } = {}) {
  const existing = document.querySelector(`aside.panel.${name}`);
  if (existing) {
    existing.style.display = 'block';
    existing.dataset.width = width;
    setPanelsGrid();
    return existing;
  }

  const panel = document.createElement('aside');
  panel.classList.add('panel', name);
  panel.dataset.width = width;

  const main = document.querySelector('main');

  if (beforeMain) {
    main.before(panel);
  } else {
    main.after(panel);
  }

  panel.innerHTML = `<h2>${name}</h2>`;
  setPanelsGrid();

  return panel;
}

export function closePanel(name) {
  const panel = document.querySelector(`aside.panel.${name}`);
  if (panel) {
    panel.style.display = 'none';
    setPanelsGrid();
  }
}
