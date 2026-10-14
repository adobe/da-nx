import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import '../dialog/dialog.js';

const [formStyle, styles] = await Promise.all([
  loadStyle(new URL('../../../styles/form.css', import.meta.url).href),
  loadStyle(import.meta.url),
]);

const defaultValidate = (href) => {
  if (!href) return 'URL is required';
  if (/^(javascript|data|vbscript):/i.test(href)) return 'Invalid URL protocol';
  return '';
};

class NxLinkDialog extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    href: { type: String },
    text: { type: String },
    title: { type: String, attribute: 'dialog-title' },
    showTitle: { type: Boolean, attribute: 'show-title' },
    anchorTitle: { type: String },
    saveLabel: { type: String },
    validate: { attribute: false },
    _urlError: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [formStyle, styles];
  }

  close() {
    this.shadowRoot.querySelector('nx-dialog')?.close();
  }

  _onSave() {
    const { elements } = this.shadowRoot.querySelector('.link-form');
    const href = elements['link-href'].value.trim();
    const error = href ? (this.validate ?? defaultValidate)(href) : defaultValidate(href);
    if (error) {
      this._urlError = error;
      return;
    }
    this._urlError = '';
    const detail = { href, text: elements['link-text'].value };
    if (this.showTitle) detail.title = elements['link-title'].value.trim();
    this.dispatchEvent(new CustomEvent('nx-link-submit', { detail, bubbles: true, composed: true }));
  }

  _onKeydown(e) {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    this._onSave();
  }

  _onClose() {
    this._urlError = '';
  }

  render() {
    if (!this.open) return nothing;
    return html`
      <nx-dialog title="${this.title ?? 'Edit link'}" @close=${this._onClose}>
        <form class="link-form" @keydown=${this._onKeydown} @submit=${(e) => e.preventDefault()}>
          <label class="nx-form-field ${this._urlError ? 'nx-field-error' : ''}">
            <span>URL</span>
            <input class="nx-input" name="link-href" type="text" autofocus placeholder="https://…"
                   autocomplete="off" .value=${this.href ?? ''}
                   aria-invalid=${this._urlError ? 'true' : 'false'}
                   @input=${() => { this._urlError = ''; }} />
            <span class="nx-input-error-msg" role="alert">${this._urlError}</span>
          </label>
          <label class="nx-form-field">
            <span>Display text</span>
            <input class="nx-input" name="link-text" type="text" placeholder="Link text"
                   autocomplete="off" .value=${this.text ?? ''} />
          </label>
          ${this.showTitle ? html`
            <label class="nx-form-field">
              <span>Title</span>
              <input class="nx-input" name="link-title" type="text" placeholder="Link title"
                     autocomplete="off" .value=${this.anchorTitle ?? ''} />
            </label>` : nothing}
        </form>
        <button type="button" slot="actions" class="nx-form-btn-secondary"
          @click=${this.close}>Cancel</button>
        <button type="button" slot="actions" class="nx-form-btn-primary"
          @click=${this._onSave}>${this.saveLabel ?? 'Save'}</button>
      </nx-dialog>
    `;
  }
}

if (!customElements.get('nx-link-dialog')) customElements.define('nx-link-dialog', NxLinkDialog);

export default NxLinkDialog;
