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

class NXCanvasHeader extends LitElement {
  static properties = {
    _icons: { state: true },
  };

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

  _togglePanel(position) {
    this.dispatchEvent(
      new CustomEvent('nx-canvas-toggle-panel', {
        bubbles: true,
        composed: true,
        detail: { position },
      }),
    );
  }

  _renderIcon(name) {
    const svg = this._icons?.[name];
    return svg ?? nothing;
  }

  render() {
    return html`
      <header class="bar" part="bar">
        <div class="group group-start" part="group-start">
          <button type="button" class="icon-btn" part="btn" data-action="toggle-panel-before" aria-label="Toggle before panel" @click=${() => this._togglePanel('before')}>
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

        <div class="group group-end" part="group-end">
          <button type="button" class="icon-btn" part="btn" data-action="toggle-panel-after" aria-label="Toggle after panel" @click=${() => this._togglePanel('after')}>
            ${this._renderIcon('splitRight')}
          </button>
        </div>
      </header>
    `;
  }
}

customElements.define('nx-canvas-header', NXCanvasHeader);
