import { LitElement, html, nothing } from 'da-lit';
import { env } from '../../scripts/nx.js';
import { loadStyle, hashChange } from '../../utils/utils.js';
import { loadIms } from '../../utils/ims.js';
import '../shared/dialog/dialog.js';

const style = await loadStyle(import.meta.url);
const contentStyle = await loadStyle(new URL('../shared/dialog/dialog-content.css', import.meta.url).href);

// da-feedback worker endpoint (see ~/Desktop/da-feedback-handoff.md for the
// full request/response contract). Not deployed to stage/prod yet, so those
// are left blank rather than pointing at a guessed URL - submitting there
// logs a warning instead of silently failing a POST.
const FEEDBACK_ENDPOINTS = {
  dev: 'http://localhost:8787/feedback',
  stage: '',
  prod: '',
};

const CATEGORIES = [
  { value: 'general', label: 'General Feedback' },
  { value: 'ui', label: 'User Interface' },
  { value: 'assistant', label: 'AI Assistant' },
  { value: 'permissions', label: 'Permissions' },
  { value: 'other', label: 'Other' },
];

// The worker's category enum is a flat string (general | feature-request |
// bug | question | other), but we want to keep both which entry point
// (Submit an idea / Report a bug) and the finer-grained CATEGORIES above
// for the team reading it in Slack. Sent as e.g. "Idea - User Interface"
// or "Bug - Permissions" instead of trying to map onto the worker's enum.
const KIND_LABELS = { idea: 'Idea', bug: 'Bug' };

/**
 * Feedback dialog: a title + category dropdown + free-text textarea + an
 * "include chat messages" checkbox + Cancel/Submit actions, wrapping the
 * shared <nx-dialog>. Submit POSTs to the da-feedback worker (see
 * FEEDBACK_ENDPOINTS above and _handleSubmit below).
 *
 * @fires close - When the dialog has fully closed (mirrors nx-dialog's
 * own close event; also removes itself from the DOM).
 */
class NxFeedbackDialog extends LitElement {
  static properties = {
    label: { attribute: false },
    kind: { attribute: false },
    _messageError: { state: true },
    _submitting: { state: true },
    _submitError: { state: true },
  };

  get _message() { return this.shadowRoot.getElementById('feedback-message'); }

  get _category() { return this.shadowRoot.getElementById('feedback-category'); }

  get _includeChatMessages() { return this.shadowRoot.getElementById('feedback-include-chat'); }

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

    const endpoint = FEEDBACK_ENDPOINTS[env];
    if (!endpoint) {
      this._submitError = 'Feedback isn\u2019t available in this environment yet.';
      return;
    }

    this._submitting = true;
    this._submitError = undefined;

    const ims = await loadIms();
    const kindLabel = KIND_LABELS[this.kind] ?? KIND_LABELS.idea;
    const categoryOption = CATEGORIES.find((c) => c.value === this._category.value);
    const categoryLabel = categoryOption?.label ?? this._category.value;
    const body = {
      category: `${kindLabel} - ${categoryLabel}`,
      message: this._message.value.trim(),
      context: {
        ...this._getContext(),
        includeChatMessages: this._includeChatMessages.checked,
      },
      ...(ims?.anonymous ? {} : { user: { email: ims.email, imsId: ims.userId } }),
    };

    try {
      const resp = await fetch(endpoint, {
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
            <label for="feedback-category">Category</label>
            <select id="feedback-category" class="da-select">
              ${CATEGORIES.map((c) => html`<option value=${c.value}>${c.label}</option>`)}
            </select>
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
            <input id="feedback-include-chat" type="checkbox" />
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
