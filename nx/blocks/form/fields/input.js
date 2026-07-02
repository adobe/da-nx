import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../nx2/utils/utils.js';
import defaults from './defaults.js';
import { icon } from '../icons.js';

const style = await loadStyle(import.meta.url);

class FormInput extends LitElement {
  static properties = {
    value: { type: String },
    label: { type: String },
    error: { type: String },
    type: { type: String },
    placeholder: { type: String },
    name: { type: String },
    required: { type: Boolean },
    disabled: { type: Boolean, reflect: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [defaults, style];
  }

  focus() {
    this.shadowRoot.querySelector('input')?.focus();
  }

  handleEvent(event) {
    this.value = event.target.value;
    // Re-dispatch from the host so listeners on <form-input> fire across the shadow boundary.
    this.dispatchEvent(new event.constructor(event.type, event));
  }

  render() {
    return html`
      <div class="form-field${this.error ? ' has-error' : ''}">
        ${this.label ? html`<label for="form-input">${this.label}${this.required ? html`<span class="form-required">*</span>` : nothing}</label>` : nothing}
        <div class="form-input-wrap">
          <input
            id="form-input"
            type=${this.type || 'text'}
            .value=${this.value ?? ''}
            placeholder=${this.placeholder ?? nothing}
            ?disabled=${this.disabled}
            @input=${this.handleEvent}
            @change=${this.handleEvent}
          />
          ${this.error ? icon('alert', 'form-field-icon') : nothing}
        </div>
        ${this.error ? html`<p class="form-field-error">${this.error}</p>` : nothing}
      </div>
    `;
  }
}

if (!customElements.get('form-input')) customElements.define('form-input', FormInput);

export default FormInput;
