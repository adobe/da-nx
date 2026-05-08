import { LitElement, html } from 'da-lit';

const EL_NAME = 'da-sc-select-field';

class StructuredContentSelectField extends LitElement {
  static properties = {
    node: { attribute: false },
    value: { attribute: false },
    error: { attribute: false },
  };

  _handleChange(e) {
    const raw = e.target.value;
    this.dispatchEvent(new CustomEvent('form-intent', {
      detail: {
        type: 'form-field-change',
        pointer: this.node?.pointer,
        value: raw === '' ? undefined : raw,
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
    const value = this.value ?? '';
    const enumValues = this.node?.enumValues ?? [];
    const required = this.node?.required ?? false;
    const error = this.error ?? '';

    return html`
      <label>
        ${label}${required ? '*' : ''}
        <select .value=${value} @focus=${this._handleFocus} @change=${this._handleChange}>
          ${!required ? html`<option value="">None</option>` : ''}
          ${enumValues.map((optionValue) => html`
            <option value=${optionValue}>${optionValue}</option>
          `)}
        </select>
      </label>
      ${error ? html`<p>${error}</p>` : ''}
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentSelectField);
}
