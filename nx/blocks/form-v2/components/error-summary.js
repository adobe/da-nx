import { LitElement, html, nothing } from 'da-lit';

const { default: getStyle } = await import('../../../utils/styles.js');
const style = await getStyle(import.meta.url);

const EL_NAME = 'da-sc-error-summary';

class StructuredContentErrorSummary extends LitElement {
  static properties = {
    validation: { attribute: false },
    origin: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  _getUniqueErrors() {
    const errors = this.validation?.errors ?? [];
    const seen = new Set();

    return errors.filter((error) => {
      const pointer = error?.pointer ?? '/data';
      const message = error?.message ?? 'Invalid value';
      const key = `${pointer}::${message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  _displayPointer(pointer) {
    if (!pointer || pointer === '/data') return 'data';
    return pointer;
  }

  _selectPointer(pointer) {
    this.dispatchEvent(new CustomEvent('form-intent', {
      detail: {
        type: 'form-nav-pointer-select',
        pointer: pointer ?? '/data',
        origin: this.origin ?? 'summary',
      },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const errors = this._getUniqueErrors();
    if (!errors.length) return nothing;

    return html`
      <section class="error-summary" aria-live="polite">
        <p class="error-summary-title">Validation errors (${errors.length})</p>
        <ul class="error-summary-list">
          ${errors.map((error) => html`
            <li>
              <button
                type="button"
                class="error-summary-item"
                @click=${() => this._selectPointer(error?.pointer)}
              >
                <span class="error-pointer">${this._displayPointer(error?.pointer)}</span>
                <span class="error-message">${error?.message ?? 'Invalid value'}</span>
              </button>
            </li>
          `)}
        </ul>
      </section>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentErrorSummary);
}
