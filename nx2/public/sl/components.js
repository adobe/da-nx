/* eslint-disable max-classes-per-file */

import { LitElement, html, nothing, spread } from 'https://da.live/deps/lit/dist/index.js';
import { loadStyle } from '../../utils/utils.js';

const style = await loadStyle(import.meta.url);

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

  focus() {
    this.shadowRoot.querySelector('input').focus();
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

class SlTextarea extends LitElement {
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

  get form() { return this._internals.form; }

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
          class="${this.class} ${this.error ? 'has-error' : ''} ${this.label ? 'has-label' : ''}"
          ${spread(this._attrs)}></textarea>
        ${this.error ? html`<p class="sl-inputfield-error">${this.error}</p>` : nothing}
      </div>
    `;
  }
}

class SlCheckbox extends LitElement {
  static formAssociated = true;

  static properties = {
    name: { type: String },
    checked: { type: Boolean },
    error: { type: String },
  };

  constructor() {
    super();
    this._internals = this.attachInternals();
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._updateFormValue();
  }

  get type() {
    return 'checkbox';
  }

  get value() {
    return this.checked ? 'true' : '';
  }

  _updateFormValue() {
    if (this.checked) {
      this._internals.setFormValue('true');
    } else {
      this._internals.setFormValue('');
    }
  }

  handleChange(event) {
    this.checked = event.target.checked;
    this._updateFormValue();
    const wcEvent = new event.constructor(event.type, { bubbles: true, composed: true });
    this.dispatchEvent(wcEvent);
  }

  render() {
    return html`
      <div class="sl-checkbox">
        <input
          type="checkbox"
          id="${this.name}"
          name="${this.name}"
          ?checked=${this.checked}
          class="${this.error ? 'has-error' : ''}"
          @change=${this.handleChange}
        />
        <label for="${this.name}"><slot></slot></label>
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
    error: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._internals = this.attachInternals();
    this._internals.setFormValue(this.value);
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

    // Set the initial value to the first option
    if (!this.value && childNodes.length) {
      this.value = childNodes.find((child) => child.nodeName === 'OPTION').value;
    }

    // Always ensure the internal select has the current value
    this._select.value = this.value;
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
          <select name=${this.name} value=${this.value} id="nx-input-exp-opt-for" @change=${this.handleChange} ?disabled="${this.disabled}" class="${this.error ? 'has-error' : ''}"></select>
        </div>
        ${this.error ? html`<p class="sl-inputfield-error">${this.error}</p>` : nothing}
      </div>
    `;
  }
}

class SlButton extends LitElement {
  static formAssociated = true;

  static properties = {
    class: { type: String },
    disabled: { type: Boolean },
    type: { type: String },
  };

  constructor() {
    super();
    this._internals = this.attachInternals();
    this.type = 'button';
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  get _attrs() {
    return this.getAttributeNames().reduce((acc, name) => {
      if ((name === 'class' || name === 'label' || name === 'disabled' || name === 'type')) return acc;
      acc[name] = this.getAttribute(name);
      return acc;
    }, {});
  }

  handleClick() {
    if (this.disabled) return;
    const { form } = this._internals;
    if (!form) return;
    if (this.type === 'submit') form.requestSubmit();
    else if (this.type === 'reset') form.reset();
  }

  render() {
    return html`
      <span class="sl-button" part="wrap">
        <button
          part="base"
          type="button"
          class="${this.class}"
          ?disabled=${this.disabled}
          @click=${this.handleClick}
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
    overflow: { type: String },
    _showLazyModal: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  updated() {
    if (this._showLazyModal && this._dialog) {
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

  onClose(e) {
    this.dispatchEvent(new Event('close', e));
  }

  get _dialog() {
    return this.shadowRoot.querySelector('dialog');
  }

  render() {
    return html`
      <dialog class="sl-dialog ${this.overflow ? `overflow-${this.overflow}` : ''}" @close=${this.onClose}>
        <slot></slot>
      </dialog>`;
  }
}

customElements.define('sl-input', SlInput);
customElements.define('sl-textarea', SlTextarea);
customElements.define('sl-checkbox', SlCheckbox);
customElements.define('sl-select', SlSelect);
customElements.define('sl-button', SlButton);
customElements.define('sl-dialog', SlDialog);

document.body.classList.remove('sl-loading');
