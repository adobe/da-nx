import { LitElement, html, nothing } from 'da-lit';

import { loadStyle } from '../../../utils/utils.js';
import { loadHrefSvg } from '../../../utils/svg.js';

const style = await loadStyle(import.meta.url);

const ICONS_BASE = new URL('../../../img/icons/', import.meta.url).href;

const ICONS = {
  undo: `${ICONS_BASE}S2_Icon_Undo_20_N.svg`,
  redo: `${ICONS_BASE}S2_Icon_Redo_20_N.svg`,
  splitLeft: `${ICONS_BASE}S2_Icon_SplitLeft_20_N.svg`,
  splitRight: `${ICONS_BASE}S2_Icon_SplitRight_20_N.svg`,
};

/** @typedef {'layout' | 'content'} CanvasHeaderMode */

class NXCanvasHeader extends LitElement {
  static properties = {
    mode: { type: String, reflect: true },
    redoAvailable: { type: Boolean, attribute: 'redo-available' },
    _icons: { state: true },
  };

  constructor() {
    super();
    /** @type {CanvasHeaderMode} */
    this.mode = 'content';
    this.redoAvailable = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  async firstUpdated() {
    const entries = Object.entries(ICONS);
    const svgs = await Promise.all(entries.map(([, href]) => loadHrefSvg(href)));
    const icons = {};
    entries.forEach(([key], i) => { icons[key] = svgs[i]; });
    this._icons = icons;
  }

  _setMode(next) {
    if (this.mode === next) return;
    this.mode = next;
    this.dispatchEvent(
      new CustomEvent('nx-canvas-mode-change', {
        bubbles: true,
        composed: true,
        detail: { mode: next },
      }),
    );
  }

  async _togglePanel(side) {
    const prop = side === 'left' ? '_leftPanel' : '_rightPanel';
    const existing = this[prop];

    if (existing?.isConnected) {
      const aside = existing.closest('aside.panel');
      aside?.remove();
      const { setPanelsGrid } = await import('../../panel/panel.js');
      setPanelsGrid();
      this[prop] = undefined;
      return;
    }

    const { showPanel } = await import('../../panel/panel.js');
    const beforeMain = side === 'left';
    const nx = showPanel({ width: '400px', beforeMain });
    this[prop] = nx;

    if (side === 'left') {
      await import('../../chat/chat.js');
      const fragment = new DOMParser().parseFromString(`
        <div class="chat-wrapper">
          <nx-chat></nx-chat>
        </div>
      `, 'text/html').body.firstChild;
      nx.append(fragment);
    }
  }

  _renderIcon(name) {
    const svg = this._icons?.[name];
    return svg ?? nothing;
  }

  render() {
    return html`
      <header class="bar" part="bar">
        <div class="group group-start" part="group-start">
          <button type="button" class="icon-btn" part="btn" data-action="toggle-left-sidebar" aria-label="Toggle left sidebar" @click=${() => this._togglePanel('left')}>
            ${this._renderIcon('splitLeft')}
          </button>
          <button type="button" class="icon-btn" part="btn" data-action="undo" aria-label="Undo">
            ${this._renderIcon('undo')}
          </button>
          <button
            type="button"
            class="icon-btn"
            part="btn"
            data-action="redo"
            aria-label="Redo"
            ?disabled=${!this.redoAvailable}
          >
            ${this._renderIcon('redo')}
          </button>
        </div>

        <div class="segmented" part="segmented" role="tablist" aria-label="Canvas view">
          <button
            type="button"
            class="segment ${this.mode === 'layout' ? 'is-selected' : ''}"
            part="segment"
            role="tab"
            aria-selected=${this.mode === 'layout'}
            @click=${() => this._setMode('layout')}
          >
            Layout
          </button>
          <button
            type="button"
            class="segment ${this.mode === 'content' ? 'is-selected' : ''}"
            part="segment"
            role="tab"
            aria-selected=${this.mode === 'content'}
            @click=${() => this._setMode('content')}
          >
            Content
          </button>
        </div>

        <div class="group group-end" part="group-end">
          <button type="button" class="icon-btn" part="btn" data-action="toggle-right-sidebar" aria-label="Toggle right sidebar" @click=${() => this._togglePanel('right')}>
            ${this._renderIcon('splitRight')}
          </button>
        </div>
      </header>
    `;
  }
}

customElements.define('nx-canvas-header', NXCanvasHeader);
