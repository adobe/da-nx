import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { getConfig } from '../../../scripts/nx.js';

const styles = await loadStyle(import.meta.url);
const { codeBase } = getConfig();

class NxSearch extends LitElement {
  static properties = {
    value: { type: String },
    label: { type: String },
    placeholder: { type: String },
    disabled: { type: Boolean, reflect: true },
    variant: { type: String, reflect: true },
    size: { type: String, reflect: true },
  };

  connectedCallback() {
    this.value ??= '';
    this.label ??= 'Search';
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  focus(options) {
    this.shadowRoot.querySelector('input')?.focus(options);
  }

  clear() {
    if (this.disabled) return;
    const input = this.shadowRoot.querySelector('input');
    if (!input.value) return;
    input.value = '';
    this.value = '';
    this.focus();
    this.dispatchEvent(new InputEvent('input', {
      inputType: 'deleteContentBackward',
      bubbles: true,
      composed: true,
    }));
  }

  onKeydown(event) {
    if (event.isComposing || this.disabled) return;
    if (event.key === 'Escape' && this.value) {
      event.preventDefault();
      event.stopPropagation();
      this.clear();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.dispatchEvent(new CustomEvent('search-submit', {
        detail: { value: this.value },
        bubbles: true,
        composed: true,
      }));
    }
  }

  render() {
    return html`
      <div class="search-field">
        <svg class="search-icon" viewBox="0 0 20 20" aria-hidden="true">
          <use href="${codeBase}/img/icons/s2-icon-search-20-n.svg#icon"></use>
        </svg>
        <input type="search" aria-label=${this.label} placeholder=${this.placeholder ?? ''}
          autocomplete="off" .value=${this.value} ?disabled=${this.disabled}
          @input=${(event) => { this.value = event.target.value; }}
          @change=${(event) => {
        event.stopPropagation();
        this.value = event.target.value;
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      }}
          @keydown=${this.onKeydown}>
        <button type="button" aria-label="Clear search" ?hidden=${!this.value}
          ?disabled=${this.disabled} @click=${this.clear}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <use href="${codeBase}/img/icons/s2-icon-close-20-n.svg#icon"></use>
          </svg>
        </button>
      </div>`;
  }
}

if (!customElements.get('nx-search')) customElements.define('nx-search', NxSearch);
