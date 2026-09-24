import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);

class NxSwitch extends LitElement {
  static properties = {
    checked: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    label: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _toggle() {
    if (this.disabled) return;
    this.checked = !this.checked;
    this.dispatchEvent(new CustomEvent('change', {
      detail: { checked: this.checked },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <button
        type="button"
        role="switch"
        aria-checked="${this.checked}"
        ?disabled=${this.disabled}
        @click=${this._toggle}>
        <span class="track"><span class="handle"></span></span>
        ${this.label ? html`<span class="label">${this.label}</span>` : nothing}
      </button>
    `;
  }
}

if (!customElements.get('nx-switch')) customElements.define('nx-switch', NxSwitch);
