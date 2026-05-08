import { LitElement, html } from 'da-lit';

const EL_NAME = 'da-sc-save-status';

class StructuredContentSaveStatus extends LitElement {
  static properties = {
    saving: { attribute: false },
  };

  render() {
    const status = this.saving?.status ?? 'idle';
    const error = this.saving?.error ?? '';

    if (status === 'failed') {
      return html`<p>Save: failed${error ? ` (${error})` : ''}</p>`;
    }

    return html`<p>Save: ${status}</p>`;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentSaveStatus);
}
