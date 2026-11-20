import { html, LitElement, nothing } from 'da-lit';
import getStyle from '../../../../nx2/public/utils/styles.js';
import '../../../../nx2/blocks/shared/dialog/dialog.js';

const [form, style] = await Promise.all([
  getStyle(new URL('../../../../nx2/styles/form.css', import.meta.url).href),
  getStyle(import.meta.url),
]);

const BTN_CLASS = {
  primary: 'nx-form-btn-secondary',
  negative: 'nx-form-btn-primary nx-btn-negative',
};

class NxSnapshotDialog extends LitElement {
  static properties = {
    details: { attribute: false },
    _open: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [form, style];
  }

  willUpdate(props) {
    if (props.has('details')) this._open = !!this.details?.open;
  }

  handleAction(value) {
    if (!this._open) return;
    this._open = false;
    const opts = { bubbles: true, composed: true, detail: value };
    this.dispatchEvent(new CustomEvent('action', opts));
  }

  renderActions() {
    const actions = this.details.actions || [{ label: 'OK' }];
    return actions.map((action) => html`
      <button
        type="button"
        slot="actions"
        class=${BTN_CLASS[action.variant] || 'nx-form-btn-primary'}
        @click=${() => this.handleAction(action.value)}>${action.label}</button>
    `);
  }

  render() {
    if (!this._open) return nothing;
    const { heading, message, width } = this.details;
    return html`
      <nx-dialog
        title=${heading || nothing}
        style=${width ? `--nx-dialog-max-width: ${width}` : nothing}
        @close=${() => this.handleAction()}>
        <div class="nx-dialog-message">${message}</div>
        ${this.renderActions()}
      </nx-dialog>
    `;
  }
}

customElements.define('nx-snapshot-dialog', NxSnapshotDialog);
