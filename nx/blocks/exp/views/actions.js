import { html, LitElement } from 'da-lit';
import getStyle from '../../../utils/styles.js';

const styles = await getStyle(import.meta.url);

class NxExpActions extends LitElement {
  static properties = { status: { attribute: false } };

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  setStatus(status) {
    this._uiStatus = status;
  }

  render() {
    return html`
      <div class="nx-action-area">
        <p class="nx-status nx-status-type-${this.status?.type || 'info'}">
          ${this.status?.text}
        </p>
        <div class="nx-actions"><slot></slot></div>
      </div>
    `;
  }
}

customElements.define('nx-exp-actions', NxExpActions);
