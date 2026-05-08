import { LitElement, html } from 'da-lit';

const EL_NAME = 'da-sc-select-field';

class StructuredContentSelectField extends LitElement {
  static properties = {
    node: { attribute: false },
    value: { attribute: false },
    error: { attribute: false },
  };

  createRenderRoot() {
    return this;
  }

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
        origin: 'editor',
      },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const label = this.node?.label ?? '';
    const value = this.value ?? '';
    const enumValues = this.node?.enumValues ?? [];
    const hasInvalidValue = value !== '' && !enumValues.includes(value);
    const options = hasInvalidValue
      ? [value, ...enumValues]
      : enumValues;
    const required = this.node?.required ?? false;
    const error = this.error ?? '';
    const readonly = !!this.node?.readonly;

    return html`
      <label data-pointer=${this.node?.pointer ?? ''}>
        ${label}${required ? '*' : ''}
        <select
          .value=${value}
          ?disabled=${readonly}
          @focus=${this._handleFocus}
          @change=${this._handleChange}
        >
          ${!required
    ? html`<option value="">None</option>`
    : html`<option value="" disabled>Please Select</option>`}
          ${options.map((optionValue) => html`
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
