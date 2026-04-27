import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);

class NxProgressCircle extends LitElement {
  static properties = {
    label: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  render() {
    const label = this.label?.trim() || 'In progress';
    return html`
      <div
        class="wrap"
        role="progressbar"
        aria-label=${label}
        aria-busy="true"
      >
        <div class="ring" aria-hidden="true"></div>
      </div>
    `;
  }
}

customElements.define('nx-progress-circle', NxProgressCircle);
