import { LitElement, html } from 'da-lit';

const EL_NAME = 'da-sc-number-field';

class StructuredContentNumberField extends LitElement {
  static properties = {
    node: { attribute: false },
    value: { attribute: false },
    error: { attribute: false },
  };

  createRenderRoot() {
    return this;
  }

  _handleInput(e) {
    const raw = e.target.value;
    const value = raw === '' ? undefined : Number(raw);

    this.dispatchEvent(new CustomEvent('form-intent', {
      detail: {
        type: 'form-field-change',
        pointer: this.node?.pointer,
        value: Number.isNaN(value) ? undefined : value,
        debounceMs: 500,
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
    const rawValue = this.value;
    const value = rawValue ?? '';
    const error = this.error ?? '';
    const required = !!this.node?.required;
    const readonly = !!this.node?.readonly;

    return html`
      <label data-pointer=${this.node?.pointer ?? ''}>
        ${label}${required ? html`<span class="is-required">*</span>` : ''}
        <input
          type="number"
          .value=${String(value)}
          ?disabled=${readonly}
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
