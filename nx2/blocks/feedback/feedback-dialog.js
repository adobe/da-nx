import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, hashChange, DA_FEEDBACK } from '../../utils/utils.js';
import { loadIms } from '../../utils/ims.js';
import { loadMessages, getRoomKey } from '../chat/utils/persistence.js';
import '../shared/dialog/dialog.js';
import '../shared/picker/picker.js';

const style = await loadStyle(import.meta.url);
const formStyle = await loadStyle(new URL('../../styles/form.css', import.meta.url).href);

const CATEGORIES = [
  { value: 'general', label: 'General Feedback' },
  { value: 'ui', label: 'User Interface' },
  { value: 'assistant', label: 'AI Assistant' },
  { value: 'permissions', label: 'Permissions' },
  { value: 'other', label: 'Other' },
];

const KIND_LABELS = { idea: 'Idea', bug: 'Bug' };

/**
 * Feedback dialog: a title + category dropdown + free-text textarea + a
 * "link my current chat session" checkbox + Cancel/Submit actions.
 */
class NxFeedbackDialog extends LitElement {
  static properties = {
    label: { attribute: false },
    _messageError: { state: true },
    _submitting: { state: true },
    _submitError: { state: true },
    _category: { state: true },
    _linkChatSession: { state: true },
  };

  constructor() {
    super();
    this._category = CATEGORIES[0].value;
    this._linkChatSession = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, formStyle];
  }

  close() {
    this._dialog?.close();
  }

  get _dialog() { return this.shadowRoot.querySelector('nx-dialog'); }

  get _message() { return this.shadowRoot.getElementById('feedback-message'); }

  _onCategoryChange({ detail: { value } }) {
    this._category = value;
    if (value === 'assistant') this._linkChatSession = true;
  }

  _onLinkChatSessionChange({ target: { checked } }) {
    this._linkChatSession = checked;
  }

  _handleClose(e) {
    if (e.target !== this._dialog) return;
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
    this.remove();
  }

  _clearMessageError() {
    if (this._messageError) this._messageError = false;
  }

  // Looks up the current chat's sessionId directly from IndexedDB (same
  // room key formula ChatController uses - see getRoomKey).
  async _getChatSessionId({ org, site }) {
    const { userId } = await loadIms();
    const room = getRoomKey({ org, site, userId });
    const { sessionId } = await loadMessages(room);
    return sessionId;
  }

  // Best-effort org/site/path context from the current DA/EW hash route.
  _getContext() {
    let context;
    const unsubscribe = hashChange.subscribe((state) => { context = state; });
    unsubscribe();
    return {
      org: context?.org ?? null,
      site: context?.site ?? null,
      path: context?.path ?? window.location.pathname,
    };
  }

  async _handleSubmit() {
    if (this._submitting) return;

    if (!this._message.value.trim()) {
      this._messageError = true;
      this._message.focus();
      return;
    }

    this._submitting = true;
    this._submitError = undefined;

    const ims = await loadIms();
    const kindLabel = KIND_LABELS[this.kind] ?? KIND_LABELS.idea;
    const categoryOption = CATEGORIES.find((c) => c.value === this._category);
    const categoryLabel = categoryOption?.label ?? this._category;

    const linkChatSession = this._linkChatSession;
    const context = this._getContext();
    const sessionId = linkChatSession ? await this._getChatSessionId(context) : null;

    const body = {
      category: `${kindLabel} - ${categoryLabel}`,
      message: this._message.value.trim(),
      context: {
        ...context,
        linkChatSession,
      },
      ...(sessionId ? { sessionId } : {}),
      ...(ims?.anonymous ? {} : { user: { email: ims.email, imsId: ims.userId } }),
    };

    try {
      const resp = await fetch(DA_FEEDBACK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`Feedback submission failed (${resp.status})`);
      this.close();
    } catch {
      this._submitError = 'Sorry, something went wrong sending your feedback. Please try again.';
    } finally {
      this._submitting = false;
    }
  }

  render() {
    return html`
      <nx-dialog title=${this.label} @close=${this._handleClose}>
        <div class="feedback-body">
          <p class="feedback-intro">Describe what you tried, what you expected, and what actually happened. Do not share credentials or tokens!</p>
          <div class="da-form-field">
            <label id="feedback-category-label">Category</label>
            <nx-picker
              .items=${CATEGORIES}
              .value=${this._category}
              placement="below-start"
              aria-labelledby="feedback-category-label"
              @change=${this._onCategoryChange}
            ></nx-picker>
          </div>
          <div class="da-form-field ${this._messageError ? 'da-field-error' : ''}">
            <label for="feedback-message">Details</label>
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
            <input id="feedback-include-chat" type="checkbox" .checked=${this._linkChatSession} @change=${this._onLinkChatSessionChange} />
            Include assistant chat history?
          </label>
          <p class="feedback-intro"><span>Your name, email and current page will be shared with the team.</span></p>
          ${this._submitError ? html`<p class="da-input-error-msg">${this._submitError}</p>` : nothing}
        </div>
        <button type="button" class="da-btn-secondary" slot="actions" @click=${this.close}>Cancel</button>
        <button type="button" class="da-btn-primary" slot="actions" ?disabled=${this._submitting} @click=${this._handleSubmit}>${this._submitting ? 'Submitting\u2026' : 'Submit'}</button>
      </nx-dialog>
    `;
  }
}

if (!customElements.get('nx-feedback-dialog')) customElements.define('nx-feedback-dialog', NxFeedbackDialog);
