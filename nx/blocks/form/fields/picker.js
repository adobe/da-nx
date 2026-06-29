import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../nx2/utils/utils.js';
import defaults from './defaults.js';
import { icon } from '../icons.js';

const style = await loadStyle(import.meta.url);

class SlPicker extends LitElement {
  static properties = {
    value: { type: String },
    label: { type: String },
    error: { type: String },
    placeholder: { type: String },
    name: { type: String },
    required: { type: Boolean },
    disabled: { type: Boolean, reflect: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [defaults, style];
  }

  get _select() { return this.shadowRoot.querySelector('select'); }

  updated(props) {
    if (props.has('value') && this._select) this._select.value = this.value ?? '';
  }

  handleChange(event) {
    this.value = event.target.value;
    this.dispatchEvent(new event.constructor(event.type, event));
  }

  // Moving the slotted options into the <select> empties the slot and re-fires
  // slotchange; ignore that echo so we don't wipe the options we just placed.
  handleSlotchange(e) {
    const options = e.target.assignedNodes({ flatten: true })
      .filter((node) => node.nodeName === 'OPTION');
    if (!options.length) return;
    if (this.placeholder) {
      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = this.placeholder;
      ph.disabled = true;
      ph.hidden = true;
      options.unshift(ph);
    }
    this._select.replaceChildren(...options);
    if (!this.value && options.length) this.value = options[0].value;
    this._select.value = this.value ?? '';
  }

  render() {
    return html`
      <slot hidden @slotchange=${this.handleSlotchange}></slot>
      <div class="sl-field${this.error ? ' has-error' : ''}">
        ${this.label ? html`<label for="sl-picker">${this.label}${this.required ? html`<span class="sl-required">*</span>` : nothing}</label>` : nothing}
        <div class="sl-picker-wrap">
          <select
            id="sl-picker"
            ?disabled=${this.disabled}
            @change=${this.handleChange}
          ></select>
          ${this.error ? icon('alert', 'sl-field-icon') : nothing}
          ${icon('chevronDown', 'sl-picker-chevron')}
        </div>
        ${this.error
        ? html`<p class="sl-field-error">${this.error}</p>`
        : html`<slot name="description"></slot>`}
      </div>
    `;
  }
}

if (!customElements.get('sl-picker')) customElements.define('sl-picker', SlPicker);

export default SlPicker;
