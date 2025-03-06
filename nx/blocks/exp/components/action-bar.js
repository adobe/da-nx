import { html, LitElement } from 'da-lit';
import { getConfig } from '../../../scripts/nexter.js';
import getStyle from '../../../utils/styles.js';

const { nxBase } = getConfig();

const sl = await getStyle(`${nxBase}/public/sl/styles.css`);
const exp = await getStyle(import.meta.url);

class ActionBar extends LitElement {
  static properties = { _uiStatus: { state: true } };

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, exp];
  }

  setStatus(status) {
    this._uiStatus = status;
  }

  render() {
    return html`
      <div class="nx-action-area">
        <p class="nx-status nx-status-type-${this._uiStatus?.type || 'info'}">${this._uiStatus?.text}</p>
        <div>
          <slot></slot>
        </div>
      </div>
    `;
  }
}

customElements.define('nx-action-bar', ActionBar);
