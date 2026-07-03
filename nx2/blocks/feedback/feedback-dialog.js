import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import '../shared/dialog/dialog.js';

const style = await loadStyle(import.meta.url);
const contentStyle = await loadStyle(new URL('../shared/dialog/dialog-content.css', import.meta.url).href);

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'ui', label: 'User Interface' },
  { value: 'editor', label: 'Editor' },
  { value: 'chat', label: 'Chat' },
  { value: 'permissions', label: 'Permissions' },
  { value: 'other', label: 'Other' },
];

/**
 * Stub feedback dialog: a title + category dropdown + free-text textarea +
 * an "include chat messages" checkbox + Cancel/Submit actions, wrapping the
 * shared <nx-dialog>. No submission endpoint yet (see _handleSubmit).
 *
 * @fires close - When the dialog has fully closed (mirrors nx-dialog's
 * own close event; also removes itself from the DOM).
 */
class NxFeedbackDialog extends LitElement {
  static properties = {
    label: { attribute: false },
    _messageError: { state: true },
  };

  get _message() { return this.shadowRoot.getElementById('feedback-message'); }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, contentStyle];
  }

  get _dialog() { return this.shadowRoot.querySelector('nx-dialog'); }

  close() {
    this._dialog?.close();
  }

  _handleClose() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
    this.remove();
  }

  _clearMessageError() {
    if (this._messageError) this._messageError = false;
  }

  // TODO: read category/includeChatMessages from the fields below (ids:
  // feedback-category, feedback-include-chat), plus this._message.value,
  // and POST them to a feedback endpoint in a follow-up iteration.
  _handleSubmit() {
    if (!this._message.value.trim()) {
      this._messageError = true;
      this._message.focus();
      return;
    }
    this.close();
  }

  render() {
    return html`
      <nx-dialog title=${this.label} @close=${this._handleClose}>
        <div class="feedback-body">
          <p class="feedback-intro">Describe what you tried, what you expected, and what actually happened. Do not share credentials or tokens!</p>
          <div class="da-form-field">
            <label class="feedback-label" for="feedback-category">Category</label>
            <select id="feedback-category" class="da-select">
              ${CATEGORIES.map((c) => html`<option value=${c.value}>${c.label}</option>`)}
            </select>
          </div>
          <div class="da-form-field ${this._messageError ? 'da-field-error' : ''}">
            <label class="feedback-label" for="feedback-message">Details</label>
            <textarea
              id="feedback-message"
              class="feedback-textarea da-input"
              autofocus
              placeholder="Tell us more..."
              aria-invalid=${this._messageError ? 'true' : 'false'}
              @input=${this._clearMessageError}
            ></textarea>
            ${this._messageError ? html`<p class="da-input-error-msg">Please describe your feedback before submitting.</p>` : nothing}
          </div>
          <label class="da-checkbox">
            <input id="feedback-include-chat" type="checkbox" />
            Include chat messages?
          </label>
          <p class="feedback-intro"><span>Your name, email and current page will be shared with the team.</span></p>
        </div>
        <button type="button" class="da-btn-secondary" slot="actions" @click=${this.close}>Cancel</button>
        <button type="button" class="da-btn-primary" slot="actions" @click=${this._handleSubmit}>Submit</button>
      </nx-dialog>
    `;
  }
}

if (!customElements.get('nx-feedback-dialog')) customElements.define('nx-feedback-dialog', NxFeedbackDialog);
