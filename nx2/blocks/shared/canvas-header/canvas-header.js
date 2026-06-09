import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { loadHrefSvg } from '../../../utils/svg.js';

const styles = await loadStyle(import.meta.url);

const TOGGLE_ICON_URL = new URL('../../../img/icons/S2_Icon_SplitLeft_20_N.svg', import.meta.url).href;

let iconPromise;
const getToggleIcon = () => {
  iconPromise ??= loadHrefSvg(TOGGLE_ICON_URL);
  return iconPromise;
};

class NxCanvasHeader extends LitElement {
  static properties = { _icon: { state: true } };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._loadIcon();
  }

  async _loadIcon() {
    const icon = await getToggleIcon();
    if (!this.isConnected) return;
    // Clone so multiple instances don't fight over the cached node.
    this._icon = icon ? icon.cloneNode(true) : nothing;
  }

  _toggleBefore() {
    this.dispatchEvent(
      new CustomEvent('header-toggle-before', { bubbles: true, composed: true }),
    );
  }

  render() {
    return html`
      <header class="bar" part="bar">
        <div class="group group-start" part="group-start">
          <button
            type="button"
            class="icon-btn"
            part="btn toggle-before"
            aria-label="Toggle panel"
            @click=${this._toggleBefore}
          >
            ${this._icon ?? nothing}
          </button>
          <slot name="start"></slot>
        </div>

        <div class="group group-center" part="group-center">
          <slot name="center"></slot>
        </div>

        <div class="group group-end" part="group-end">
          <slot name="end"></slot>
        </div>
      </header>
    `;
  }
}

if (!customElements.get('nx-canvas-header')) customElements.define('nx-canvas-header', NxCanvasHeader);
