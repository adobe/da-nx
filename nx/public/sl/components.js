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
      formData.append(this.name, this.value || '');
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

class SlInput extends LitElement {
  static formAssociated = true;

  static properties = {
    value: { type: String },
    class: { type: String },
    label: { type: String },
    error: { type: String },
    name: { type: String },
  };

  constructor() {
    super();
    this._internals = this.attachInternals();
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._internals.setFormValue(this.value);
  }

  handleEvent(event) {
    this.value = event.target.value;
    this._internals.setFormValue(this.value);
    const wcEvent = new event.constructor(event.type, event);
    this.dispatchEvent(wcEvent);
  }

  handleKeyDown(event) {
    if (event.key !== 'Enter') return;

    if (!this.form) return;

    const submitEvent = new SubmitEvent('submit', { bubbles: true, cancelable: true });

    this.form.dispatchEvent(submitEvent);

    // Do nothing if the event was prevented
    if (submitEvent.defaultPrevented) return;

    // Submit the form if not prevented
    this.form.submit();
  }

  get _attrs() {
    return this.getAttributeNames().reduce((acc, name) => {
      if ((name === 'class' || name === 'label' || name === 'value' || name === 'error')) return acc;
      acc[name] = this.getAttribute(name);
      return acc;
    }, {});
  }

  get form() { return this._internals.form; }

  render() {
    return html`
      <div class="sl-inputfield">
        ${this.label ? html`<label for="${this.name}">${this.label}</label>` : nothing}
        <input
          .value="${this.value || ''}"
          @input=${this.handleEvent}
          @change=${this.handleEvent}
          @keydown=${this.handleKeyDown}
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

class SlSelect extends LitElement {
  static formAssociated = true;

  static properties = {
    name: { type: String },
    label: { type: String },
    value: { type: String },
    disabled: { type: Boolean },
    placeholder: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._internals = this.attachInternals();
  }

  update(props) {
    if (props.has('value')) {
      this._internals.setFormValue(this.value);
      if (this._select) this._select.value = this.value;
    }
    super.update();
  }

  handleChange(event) {
    this.value = event.target.value;
    this._internals.setFormValue(this.value);
    const wcEvent = new event.constructor(event.type, event);
    this.dispatchEvent(wcEvent);
  }

  handleSlotchange(e) {
    const childNodes = e.target.assignedNodes({ flatten: true });
    this._select.append(...childNodes);
  }

  get _select() {
    return this.shadowRoot.querySelector('select');
  }

  render() {
    return html`
      <slot @slotchange=${this.handleSlotchange}></slot>
      <div class="sl-inputfield">
        ${this.label ? html`<label for="${this.name}">${this.label}</label>` : nothing}
        <div class="sl-inputfield-select-wrapper">
          <select name=${this.name} value=${this.value} id="nx-input-exp-opt-for" @change=${this.handleChange} ?disabled="${this.disabled}"></select>
        </div>
      </div>
    `;
  }
}

class SlButton extends LitElement {
  static formAssociated = true;

  static properties = { class: { type: String } };

  constructor() {
    super();
    this._internals = this.attachInternals();
  }

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
    _showLazyModal: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  updated() {
    if (this._showLazyModal) {
      this._showLazyModal = undefined;
      this.showModal();
    }
  }

  showModal() {
    if (!this._dialog) {
      this._showLazyModal = true;
      return;
    }
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
