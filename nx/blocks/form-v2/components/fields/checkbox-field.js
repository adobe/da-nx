import { LitElement, html } from 'da-lit';

const EL_NAME = 'da-sc-checkbox-field';

class StructuredContentCheckboxField extends LitElement {
  static properties = {
    node: { attribute: false },
    value: { attribute: false },
    error: { attribute: false },
  };

  _handleChange(e) {
    this.dispatchEvent(new CustomEvent('form-intent', {
      detail: {
        type: 'form-field-change',
        pointer: this.node?.pointer,
        value: e.target.checked,
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
    const checked = !!this.value;
    const error = this.error ?? '';

    return html`
      <label>
        <input
          type="checkbox"
          .checked=${checked}
          @focus=${this._handleFocus}
          @change=${this._handleChange}
        />
        ${label}
      </label>
      ${error ? html`<p>${error}</p>` : ''}
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentCheckboxField);
}
