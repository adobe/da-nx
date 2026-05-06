import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);

class NxOverlay extends LitElement {
  _onBackdropClick = (e) => {
    if (e.target !== e.currentTarget) return;
    this.dispatchEvent(new CustomEvent('nx-overlay-backdrop-click', {
      bubbles: true,
      composed: true,
    }));
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  render() {
    return html`
      <div class="backdrop" @click=${this._onBackdropClick}>
        <div class="content"><slot></slot></div>
      </div>
    `;
  }
}

customElements.define('nx-overlay', NxOverlay);
