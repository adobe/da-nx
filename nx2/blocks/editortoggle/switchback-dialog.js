import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, hashChange, DA_FEEDBACK } from '../../utils/utils.js';
import { loadIms } from '../../utils/ims.js';
import '../shared/dialog/dialog.js';

const style = await loadStyle(import.meta.url);
const formStyle = await loadStyle(new URL('../../styles/form.css', import.meta.url).href);

// Distinguishing category so switch-back responses are filterable in the
// feedback backend, separate from the general feedback dialog's submissions.
const CATEGORY = 'Editor switch-back';

/**
 * One-time "why did you switch back?" prompt, shown the first time a user turns
 * the new editor off and lands back on /edit (armed/consumed via ewFlags.js).
 * A single free-text box, dismissable — closing without submitting is fine, the
 * prompt is already marked seen before it opens. POSTs to the shared
 * DA_FEEDBACK endpoint, same as nx-feedback-dialog.
 */
class NxEwSwitchbackDialog extends LitElement {
  static properties = {
    _messageError: { state: true },
    _submitting: { state: true },
    _submitError: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, formStyle];
  }

  get _dialog() { return this.shadowRoot.querySelector('nx-dialog'); }

  get _message() { return this.shadowRoot.getElementById('switchback-message'); }

  close() {
    this._dialog?.close();
  }

  _handleClose(e) {
    if (e.target !== this._dialog) return;
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

    this._submitting = true;
    this._submitError = undefined;

    const ims = await loadIms();
    const body = {
      category: CATEGORY,
      message: this._message.value.trim(),
      context: this._getContext(),
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
      <nx-dialog title="Help us improve the new editor" @close=${this._handleClose}>
        <div class="switchback-body">
          <p class="switchback-intro">You just switched back to the old editor. What made you switch back?</p>
          <div class="da-form-field ${this._messageError ? 'da-field-error' : ''}">
            <label for="switchback-message">Your feedback</label>
            <textarea
              id="switchback-message"
              class="switchback-textarea da-input"
              autofocus
              placeholder="Tell us what didn't work for you..."
              aria-invalid=${this._messageError ? 'true' : 'false'}
              @input=${this._clearMessageError}
            ></textarea>
            ${this._messageError ? html`<p class="da-input-error-msg">Please add a note before submitting.</p>` : nothing}
          </div>
          <p class="switchback-intro"><span>Your name, email and current page will be shared with the team.</span></p>
          ${this._submitError ? html`<p class="da-input-error-msg">${this._submitError}</p>` : nothing}
        </div>
        <button type="button" class="da-btn-secondary" slot="actions" @click=${this.close}>Skip</button>
        <button type="button" class="da-btn-primary" slot="actions" ?disabled=${this._submitting} @click=${this._handleSubmit}>${this._submitting ? 'Submitting…' : 'Submit'}</button>
      </nx-dialog>
    `;
  }
}

if (!customElements.get('nx-ew-switchback-dialog')) {
  customElements.define('nx-ew-switchback-dialog', NxEwSwitchbackDialog);
}
