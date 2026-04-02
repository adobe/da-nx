import { LitElement, html } from 'lit';

import { loadFragment } from '../fragment/fragment.js';
import { loadStyle } from '../../utils/utils.js';

const style = await loadStyle(import.meta.url);

// Computes css variables to define grid areas
export function setPanelsGrid() {
  const { body } = document;
  if (!body.classList.contains('app-frame')) return;

  const beforeMain = [...body.querySelectorAll('aside.panel[data-position="before"]')];
  const afterMain = [...body.querySelectorAll('aside.panel[data-position="after"]')];

  beforeMain.forEach((el, i) => { el.style.gridArea = `nx-panel-before-${i}`; });
  afterMain.forEach((el, i) => { el.style.gridArea = `nx-panel-after-${i}`; });

  const colCount = 1 + beforeMain.length + 1 + afterMain.length;
  const headerRow = Array(colCount).fill('header').join(' ');
  const contentRow = [
    'sidenav',
    ...beforeMain.map((_, i) => `nx-panel-before-${i}`),
    'main',
    ...afterMain.map((_, i) => `nx-panel-after-${i}`),
  ].join(' ');

  const getWidth = (el) => {
    const w = el.dataset.width?.trim();
    return w ? `min(${w}, 40vw)` : 'minmax(0, auto)';
  };
  const columns = [
    'var(--s2-nav-width)',
    ...beforeMain.map(getWidth),
    '1fr',
    ...afterMain.map(getWidth),
  ].join(' ');

  body.style.setProperty('--app-frame-areas', `"${headerRow}" var(--s2-nav-height) "${contentRow}" 1fr`);
  body.style.setProperty('--app-frame-columns', columns);
}

const PANEL_WIDTH_MIN = 120;
const PANEL_WIDTH_MAX = () => Math.min(1600, window.innerWidth * 0.4);

function parsePanelWidth(aside) {
  const w = aside.dataset.width?.trim();
  if (w && /^\d+(\.\d+)?px$/i.test(w)) return parseFloat(w);
  return aside.getBoundingClientRect().width;
}

function applyPanelWidth(aside, px) {
  aside.dataset.width = `${Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX(), Math.round(px)))}px`;
}

class NXPanel extends LitElement {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._panelAside = this.closest('aside.panel');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    const aside = this._panelAside;
    this._panelAside = undefined;
    if (aside?.isConnected && aside.childElementCount === 0) {
      aside.remove();
    }
    setPanelsGrid();
  }

  _resizePointerDown(downEvent) {
    const aside = this.closest('aside.panel');
    if (!aside || downEvent.button !== 0) return;
    const deltaSign = aside.dataset.position === 'before' ? 1 : -1;

    const handle = downEvent.currentTarget;
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
    };

    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('pointercancel', onPointerUp);
  }

  render() {
    const aside = this.closest('aside.panel');
    const edge = aside?.dataset.position === 'before' ? 'trailing' : 'leading';

    return html`
      <div class="panel-shell">
        <div class="panel-body">
          <slot></slot>
        </div>
      </div>
      <button
        type="button"
        class="panel-resize-handle panel-resize-handle-${edge}"
        aria-label="Resize panel"
        @pointerdown=${this._resizePointerDown}
      ></button>
    `;
  }
}

customElements.define('nx-panel', NXPanel);

function createPanel({ width, beforeMain }) {
  const aside = document.createElement('aside');
  aside.classList.add('panel');
  aside.dataset.width = width;
  aside.dataset.position = beforeMain ? 'before' : 'after';

  const nx = document.createElement('nx-panel');
  aside.append(nx);

  if (beforeMain) {
    document.querySelector('main').before(aside);
  } else {
    document.querySelector('main').after(aside);
  }

  return nx;
}

export function showPanel({ width = '400px', beforeMain = false } = {}) {
  const nx = createPanel({ width, beforeMain });
  setPanelsGrid();
  return nx;
}

export default async function decorate(block) {
  const a = block.querySelector('a');
  if (!a) return;

  const fragment = await loadFragment(a.href);

  const beforeMain = block.dataset.beforeMain === 'true';
  const width = block.dataset.width?.trim() || '400px';

  const nx = createPanel({ width, beforeMain });
  if (fragment && nx) {
    nx.replaceChildren();
    while (fragment.firstChild) {
      nx.appendChild(fragment.firstChild);
    }
  }

  block.remove();
  setPanelsGrid();
}
