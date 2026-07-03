import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { getConfig } from '../../scripts/nx.js';
import '../shared/dialog/dialog.js';

const { codeBase } = getConfig();

// Dynamically imported alongside this module (only when a feedback item is
// actually selected, see feedback.js's openFeedbackDialog), not statically
// at nav load time: sl-button is only needed once this dialog is shown.
const [style] = await Promise.all([
  loadStyle(import.meta.url),
  import(`${codeBase}/public/sl/components.js`),
]);

/**
 * Stub feedback dialog: a title + free-text textarea + Cancel/Submit
 * actions, wrapping the shared <nx-dialog>. No submission endpoint yet
 * (see _handleSubmit).
 *
 * @fires close - When the dialog has fully closed (mirrors nx-dialog's
 * own close event; also removes itself from the DOM).
 */
class NxFeedbackDialog extends LitElement {
  static properties = {
    label: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  get _dialog() { return this.shadowRoot.querySelector('nx-dialog'); }

  close() {
    this._dialog?.close();
  }

  _handleClose() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
    this.remove();
  }

  _handleSubmit() {
    // TODO: POST to feedback endpoint in a follow-up iteration.
    this.close();
  }

  render() {
    return html`
      <nx-dialog title=${this.label} @close=${this._handleClose}>
        <textarea class="feedback-textarea" autofocus placeholder="Tell us more..."></textarea>
        <sl-button slot="actions" @click=${this.close}>Cancel</sl-button>
        <sl-button slot="actions" @click=${this._handleSubmit}>Submit</sl-button>
      </nx-dialog>
    `;
  }
}

if (!customElements.get('nx-feedback-dialog')) customElements.define('nx-feedback-dialog', NxFeedbackDialog);
