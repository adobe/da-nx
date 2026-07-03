import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import '../shared/dialog/dialog.js';

const style = await loadStyle(import.meta.url);

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'ui', label: 'UI' },
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

  // TODO: read category/message/includeChatMessages from the fields below
  // (ids: feedback-category, feedback-message, feedback-include-chat) and
  // POST them to a feedback endpoint in a follow-up iteration.
  _handleSubmit() {
    this.close();
  }

  render() {
    return html`
      <nx-dialog title=${this.label} @close=${this._handleClose}>
        <div class="feedback-body">
          <p class="feedback-intro">Your name, email, session ID, and current page will be shared with the team.</p>
          <p class="feedback-intro">Describe what you tried, what you expected, and what actually happened. Do not share credentials or tokens!</p>
          <div class="feedback-field">
            <label class="feedback-label" for="feedback-category">Category</label>
            <select id="feedback-category" class="feedback-select">
              ${CATEGORIES.map((c) => html`<option value=${c.value}>${c.label}</option>`)}
            </select>
          </div>
          <div class="feedback-field">
            <label class="feedback-label" for="feedback-message">Details</label>
            <textarea id="feedback-message" class="feedback-textarea" autofocus placeholder="Tell us more..."></textarea>
          </div>
          <label class="feedback-checkbox">
            <input id="feedback-include-chat" type="checkbox" />
            Include chat messages?
          </label>
        </div>
        <button type="button" class="feedback-btn" slot="actions" @click=${this.close}>Cancel</button>
        <button type="button" class="feedback-btn feedback-btn-primary" slot="actions" @click=${this._handleSubmit}>Submit</button>
      </nx-dialog>
    `;
  }
}

if (!customElements.get('nx-feedback-dialog')) customElements.define('nx-feedback-dialog', NxFeedbackDialog);
