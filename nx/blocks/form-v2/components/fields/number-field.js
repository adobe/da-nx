import { LitElement, html } from 'da-lit';

const EL_NAME = 'da-sc-number-field';

class StructuredContentNumberField extends LitElement {
  static properties = {
    node: { attribute: false },
    value: { attribute: false },
    error: { attribute: false },
  };

  _handleInput(e) {
    const raw = e.target.value;
    const value = raw === '' ? undefined : Number(raw);

    this.dispatchEvent(new CustomEvent('form-intent', {
      detail: {
        type: 'form-field-change',
        pointer: this.node?.pointer,
        value: Number.isNaN(value) ? undefined : value,
      },
      bubbles: true,
      composed: true,
    }));
  }

  _handleFocus() {
    this.dispatchEvent(new CustomEvent('form-intent', {
      detail: {
        type: 'form-nav-pointer-select',
        pointer: this.node?.pointer,
      },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const label = this.node?.label ?? '';
    const rawValue = this.value;
    const value = rawValue ?? '';
    const error = this.error ?? '';
    const required = this.node?.required ? '*' : '';

    return html`
      <label>
        ${label}${required}
        <input
          type="number"
          .value=${String(value)}
          @focus=${this._handleFocus}
          @input=${this._handleInput}
        />
      </label>
      ${error ? html`<p>${error}</p>` : ''}
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentNumberField);
}
