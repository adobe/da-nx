import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { getConfig } from '../../../scripts/nx.js';

const styles = await loadStyle(import.meta.url);
const { codeBase } = getConfig();

class NxSegmentedBtn extends LitElement {
  static properties = {
    items: { attribute: false },
    value: { type: String },
    label: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _select(val) {
    if (val === this.value) return;
    this.value = val;
    this.dispatchEvent(new CustomEvent('change', {
      detail: { value: val },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <div class="segmented" role="group" aria-label="${this.label || nothing}">
        ${this.items?.map((item) => html`
          <button type="button"
            class="segment${item.icon ? ' segment-icon' : ''}${this.value === item.value ? ' is-selected' : ''}"
            aria-pressed="${this.value === item.value}"
            aria-label="${item.ariaLabel || nothing}"
            title="${item.title || nothing}"
            @click=${() => this._select(item.value)}>
            ${item.icon
        ? html`<svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="${codeBase}/img/icons/s2-icon-${item.icon}-20-n.svg#icon"></use></svg>`
        : item.label}
          </button>
        `)}
      </div>
    `;
  }
}

if (!customElements.get('nx-segmented-btn')) customElements.define('nx-segmented-btn', NxSegmentedBtn);
