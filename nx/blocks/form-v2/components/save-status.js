import { LitElement, html } from 'da-lit';

const { default: getStyle } = await import('../../../utils/styles.js');
const style = await getStyle(import.meta.url);

const EL_NAME = 'da-sc-save-status';

class StructuredContentSaveStatus extends LitElement {
  static properties = {
    saving: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  _formatTime(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  render() {
    const status = this.saving?.status ?? 'idle';
    const error = this.saving?.error ?? '';
    const updatedAt = this._formatTime(this.saving?.updatedAt);

    if (status === 'saving') {
      return html`
        <p class="save-status status-saving" role="status" aria-live="polite">
          Saving...
        </p>
      `;
    }

    if (status === 'failed') {
      return html`
        <p class="save-status status-failed" role="status" aria-live="polite">
          Save failed${error ? `: ${error}` : '.'}
        </p>
      `;
    }

    if (status === 'saved') {
      return html`
        <p class="save-status status-saved" role="status" aria-live="polite">
          Saved${updatedAt ? ` at ${updatedAt}` : ''}
        </p>
      `;
    }

    return html`
      <p class="save-status status-idle" role="status" aria-live="polite">
        Ready
      </p>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentSaveStatus);
}
