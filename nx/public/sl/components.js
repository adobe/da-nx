/* eslint-disable max-classes-per-file */
/* eslint-disable-next-line import/no-unresolved */
import { LitElement, html, nothing, spread } from 'https://da.live/deps/lit/dist/index.js';
import { loadStyle } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';

const nx = `${new URL(import.meta.url).origin}/nx`;
await loadStyle(`${nx}/public/sl/styles.css`);
const style = await getStyle(import.meta.url);

class FormAwareLitElement extends LitElement {
  handleFormData({ formData }) {
    if (this.name) {
      formData.append(this.name, this.value);
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this.form = this.closest('form');
    if (this.form) {
      this.form.addEventListener('formdata', this.handleFormData.bind(this));
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.form) {
      this.form.removeEventListener('formdata', this.handleFormData.bind(this));
    }
  }
}

class SlInput extends FormAwareLitElement {
  static properties = {
    value: { type: String },
    class: { type: String },
    label: { type: String },
    error: { type: String },
    name: { type: String },
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
        ${this.label ? html`<label for="${this.name}">${this.label}</label>` : nothing}
        <input
          .value="${this.value || ''}"
          @input=${this.handleEvent}
          @change=${this.handleEvent}
          class="${this.class} ${this.error ? 'has-error' : ''}"
          ${spread(this._attrs)} />
        ${this.error ? html`<p class="sl-inputfield-error">${this.error}</p>` : nothing}
      </div>
    `;
  }
}

class SlTextarea extends FormAwareLitElement {
  static properties = {
    value: { type: String },
    class: { type: String },
    label: { type: String },
    error: { type: String },
    name: { type: String },
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
      <div class="sl-inputfield sl-inputarea">
        ${this.label ? html`<label for="${this.name}">${this.label}</label>` : nothing}
        <textarea
          .value="${this.value || ''}"
          @input=${this.handleEvent}
          @change=${this.handleEvent}
          class="${this.class} ${this.error ? 'has-error' : ''}"
          ${spread(this._attrs)}></textarea>
        ${this.error ? html`<p class="sl-inputfield-error">${this.error}</p>` : nothing}
      </div>
    `;
  }
}

class SlSelect extends FormAwareLitElement {
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
        ${this.label ? html`<label for="${this.name}">${this.label}</label>` : nothing}
        <div class="sl-inputfield-select-wrapper">
          <select value=${this.value} id="nx-input-exp-opt-for" @change=${this.handleChange} ?disabled="${this.disabled}"></select>
        </div>
      </div>
    `;
  }
}

class SlButton extends LitElement {
  static properties = { class: { type: String } };

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
      <span class="sl-button">
        <button
          class="${this.class}"
          ${spread(this._attrs)}>
          <slot></slot>
        </button>
      </span>`;
  }
}

class SlDialog extends LitElement {
  static properties = {
    open: { type: Boolean },
    modal: { type: Boolean },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  showModal() {
    this._dialog.showModal();
  }

  show() {
    this._dialog.show();
  }

  close() {
    this._dialog.close();
  }

  get _dialog() {
    return this.shadowRoot.querySelector('dialog');
  }

  render() {
    return html`
      <dialog class="sl-dialog">
        <slot></slot>
      </dialog>`;
  }
}

customElements.define('sl-input', SlInput);
customElements.define('sl-textarea', SlTextarea);
customElements.define('sl-select', SlSelect);
customElements.define('sl-button', SlButton);
customElements.define('sl-dialog', SlDialog);

document.body.classList.remove('sl-loading');
