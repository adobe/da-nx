import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import '../shared/dialog/dialog.js';
import '../shared/picker/picker.js';

const style = await loadStyle(import.meta.url);

// da-btn-primary/da-btn-secondary/da-checkbox below are reusable form
// primitives from shared/dialog/dialog-content.css. Even though those
// buttons/checkbox end up slotted into <nx-dialog>, the DOM nodes
// themselves live in *this* component's own shadow root (that's where
// render() below creates them) — so, like feedback-dialog.css's own
// .feedback-* rules, this sheet needs to be in *our* shadowRoot's own
// adoptedStyleSheets, not document.adoptedStyleSheets (which only reaches
// the top-level document, never into any shadow root).
const contentStyle = await loadStyle(new URL('../shared/dialog/dialog-content.css', import.meta.url).href);

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
    _category: { state: true },
  };

  constructor() {
    super();
    this._category = CATEGORIES[0].value;
  }

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

  _onCategoryChange({ detail: { value } }) {
    this._category = value;
  }

  // TODO: read message/includeChatMessages from the fields below (ids:
  // feedback-message, feedback-include-chat), plus this._category, and
  // POST them to a feedback endpoint in a follow-up iteration.
  _handleSubmit() {
    this.close();
  }

  render() {
    return html`
      <nx-dialog title=${this.label} @close=${this._handleClose}>
        <div class="feedback-body">
          <p class="feedback-intro"><span>Your name, email, session ID, and current page will be shared with the team.</span></p>
          <p class="feedback-intro">Describe what you tried, what you expected, and what actually happened. Do not share credentials or tokens!</p>
          <div class="feedback-field">
            <span class="feedback-label">Category</span>
            <nx-picker
              .items=${CATEGORIES}
              .value=${this._category}
              placement="below-start"
              @change=${this._onCategoryChange}
            ></nx-picker>
          </div>
          <div class="feedback-field">
            <label class="feedback-label" for="feedback-message">Details</label>
            <textarea id="feedback-message" class="feedback-textarea" autofocus placeholder="Tell us more..."></textarea>
          </div>
          <label class="da-checkbox">
            <input id="feedback-include-chat" type="checkbox" />
            Include chat messages?
          </label>
        </div>
        <button type="button" class="da-btn-secondary" slot="actions" @click=${this.close}>Cancel</button>
        <button type="button" class="da-btn-primary" slot="actions" @click=${this._handleSubmit}>Submit</button>
      </nx-dialog>
    `;
  }
}

if (!customElements.get('nx-feedback-dialog')) customElements.define('nx-feedback-dialog', NxFeedbackDialog);
