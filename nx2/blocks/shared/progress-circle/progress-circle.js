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
    const visibleLabel = this.label?.trim() || '';
    const ariaLabel = visibleLabel || 'In progress';
    return html`
      <div
        class="wrap"
        role="progressbar"
        aria-label=${ariaLabel}
        aria-busy="true"
      >
        <div class="ring" aria-hidden="true"></div>
        ${visibleLabel
          ? html`<p class="label" aria-hidden="true">${visibleLabel}...</p>`
          : ''}
      </div>
    `;
  }
}

customElements.define('nx-progress-circle', NxProgressCircle);
