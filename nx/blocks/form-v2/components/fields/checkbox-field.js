import { LitElement, html } from 'da-lit';

const EL_NAME = 'da-sc-checkbox-field';

class StructuredContentCheckboxField extends LitElement {
  static properties = {
    node: { attribute: false },
    value: { attribute: false },
    error: { attribute: false },
  };

  createRenderRoot() {
    return this;
  }

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
        origin: 'editor',
      },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const label = this.node?.label ?? '';
    const checked = !!this.value;
    const error = this.error ?? '';
    const required = this.node?.required ? '*' : '';
    const readonly = !!this.node?.readonly;

    return html`
      <label data-pointer=${this.node?.pointer ?? ''}>
        <input
          type="checkbox"
          .checked=${checked}
          ?disabled=${readonly}
          @focus=${this._handleFocus}
          @change=${this._handleChange}
        />
        ${label}${required}
      </label>
      ${error ? html`<p>${error}</p>` : ''}
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentCheckboxField);
}
