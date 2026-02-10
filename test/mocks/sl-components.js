import { LitElement, html, nothing } from 'da-lit';

class SlInput extends LitElement {
  static properties = {
    value: { type: String },
    name: { type: String },
    type: { type: String },
    error: { type: String },
    placeholder: { type: String },
    label: { type: String },
  };

  render() {
    return html`<input .value=${this.value || ''} name=${this.name || nothing} type=${this.type || 'text'} />`;
  }
}

class SlTextarea extends LitElement {
  static properties = {
    value: { type: String },
    name: { type: String },
    resize: { type: String },
  };

  render() {
    return html`<textarea .value=${this.value || ''} name=${this.name || nothing}></textarea>`;
  }
}

class SlButton extends LitElement {
  static properties = {
    disabled: { type: Boolean },
    size: { type: String },
  };

  render() {
    return html`<button ?disabled=${this.disabled}><slot></slot></button>`;
  }
}

class SlDialog extends LitElement {
  showModal() {}

  show() {}

  close() {}

  render() {
    return html`<dialog><slot></slot></dialog>`;
  }
}

customElements.define('sl-input', SlInput);
customElements.define('sl-textarea', SlTextarea);
customElements.define('sl-button', SlButton);
customElements.define('sl-dialog', SlDialog);
