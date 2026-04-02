/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

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

  beforeMain.forEach((el, i) => { el.style.gridArea = `nx-pb-${i}`; });
  afterMain.forEach((el, i) => { el.style.gridArea = `nx-pa-${i}`; });

  const colCount = 1 + beforeMain.length + 1 + afterMain.length;
  const headerRow = Array(colCount).fill('header').join(' ');
  const contentRow = [
    'sidenav',
    ...beforeMain.map((_, i) => `nx-pb-${i}`),
    'main',
    ...afterMain.map((_, i) => `nx-pa-${i}`),
  ].join(' ');

  const track = (el) => {
    const w = el.dataset.width?.trim();
    return w ? `min(${w}, 40vw)` : 'minmax(0, auto)';
  };
  const columns = [
    'var(--s2-nav-width)',
    ...beforeMain.map(track),
    '1fr',
    ...afterMain.map(track),
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

export function createPanel({ width = '200px', beforeMain = false } = {}) {
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

export function showPanel({ width = '200px', beforeMain = false } = {}) {
  const nx = createPanel({ width, beforeMain });
  setPanelsGrid();
  return nx;
}

export default async function decorate(block) {
  const a = block.querySelector('a');
  if (!a) return;

  const fragment = await loadFragment(a.href);

  const beforeMain = block.dataset.beforeMain === 'true';
  const width = block.dataset.width?.trim() || '200px';

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
