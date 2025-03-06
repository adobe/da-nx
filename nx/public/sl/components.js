/* eslint-disable max-classes-per-file */
import { LitElement, html, nothing, spread } from 'da-lit';
import getStyle from '../../utils/styles.js';

const style = await getStyle(import.meta.url);

class SlInput extends LitElement {
  static properties = {
    value: { type: String },
    class: { type: String },
    label: { type: String },
    error: { type: String },
  };

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  handleEvent(event) {
    this.value = event.target.value;
    const wcEvent = new event.constructor(event.type, event);
    this.dispatchEvent(wcEvent);
  }

  get _attrs() {
    return this.getAttributeNames().reduce((acc, name) => {
      if ((name === 'class' || name === 'label' || name === 'value' || name === 'error')) return acc;
      acc[name] = this.getAttribute(name);
      return acc;
    }, {});
  }

  render() {
    return html`
      <div class="sl-inputfield">
        ${this.label ? html`<label for="sl-input-${this.name}">${this.label}</label>` : nothing}
        <input
          .value="${this.value}"
          @input=${this.handleEvent}
          @change=${this.handleEvent}
          class="${this.class} ${this.error ? 'has-error' : ''}"
          ${spread(this._attrs)} />
        ${this.error ? html`<p class="sl-inputfield-error">${this.error}</p>` : nothing}
      </div>
    `;
  }
}

class SlSelect extends LitElement {
  static properties = {
    name: { type: String },
    label: { type: String },
    value: { type: String },
    disabled: { type: Boolean },
    placeholder: { type: String },
  };

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  handleChange(event) {
    this.value = event.target.value;
    const wcEvent = new event.constructor(event.type, event);
    this.dispatchEvent(wcEvent);
  }

  handleSlotchange(e) {
    const childNodes = e.target.assignedNodes({ flatten: true });
    const field = this.shadowRoot.querySelector('select');
    field.append(...childNodes);
    // Set the value after the options are
    if (this.value) field.value = this.value;
  }

  render() {
    return html`
      <slot @slotchange=${this.handleSlotchange}></slot>
      <div class="sl-inputfield">
        ${this.label ? html`<label for="sl-input-${this.name}">${this.label}</label>` : nothing}
        <div class="sl-inputfield-select-wrapper">
          <select .value=${this.value} id="nx-input-exp-opt-for" @change=${this.handleChange} ?disabled="${this.disabled}"></select>
        </div>
      </div>
    `;
  }
}

class SlButton extends LitElement {
  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  get _attrs() {
    return this.getAttributeNames().reduce((acc, name) => {
      if ((name === 'class' || name === 'label')) return acc;
      acc[name] = this.getAttribute(name);
      return acc;
    }, {});
  }

  render() {
    return html`
      <button
        class="${this.getAttribute('class')}"
        ${spread(this._attrs)}>
        <slot></slot>
      </button>`;
  }
}

class SlDialog extends LitElement {
  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  static properties = { open: { type: Boolean }, modal: { type: Boolean } };

  showModal() {
    this.shadowRoot.querySelector('dialog').showModal();
  }

  show() {
    this.shadowRoot.querySelector('dialog').show();
  }

  close() {
    this.shadowRoot.querySelector('dialog').close();
  }

  updated(props) {
    if (props.has('open')) {
      if (this.open) {
        if (this.modal) {
          this.showModal();
        } else {
          this.show();
        }
      } else {
        this.close();
      }
    }
  }

  render() {
    return html`
      <dialog class="sl-dialog">
        <slot></slot>
      </dialog>
    `;
  }
}

customElements.define('sl-input', SlInput);
customElements.define('sl-select', SlSelect);
customElements.define('sl-button', SlButton);
customElements.define('sl-dialog', SlDialog);
