import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { loadFragment } from '../fragment/fragment.js';
import '../shared/dialog/dialog.js';

const style = await loadStyle(import.meta.url);
const formStyle = await loadStyle(new URL('../../styles/form.css', import.meta.url).href);

// Well-known, hardcoded path (matches the /nx/fragments convention used by
// nav/sidenav) so the welcome guide works regardless of a consuming project's
// own config. Authored at main--da-live--adobe.aem.page/nx/fragments/guides/welcome.
const WELCOME_PATH = '/nx/fragments/guides/welcome';

/**
 * One-time welcome guide shown the first time a user opts into the new editor
 * and lands on /canvas. Armed by nx-editortoggle when the toggle flips on and
 * shown on the next canvas render (see ewFlags.js). Wraps nx-dialog and slots
 * in content loaded from the WELCOME_PATH fragment.
 */
class NxEwWelcomeDialog extends LitElement {
  static properties = {
    _content: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, formStyle];
    this._loadContent();
  }

  get _dialog() { return this.shadowRoot.querySelector('nx-dialog'); }

  async _loadContent() {
    const fragment = await loadFragment(WELCOME_PATH);
    // Fragment failed to load — nothing to show, so tear down silently rather
    // than popping an empty dialog.
    if (!fragment) {
      this.remove();
      return;
    }
    this._content = fragment;
  }

  close() {
    this._dialog?.close();
  }

  _handleClose(e) {
    if (e.target !== this._dialog) return;
    this.remove();
  }

  render() {
    if (!this._content) return nothing;
    return html`
      <nx-dialog @close=${this._handleClose}>
        <div class="welcome-body">${this._content}</div>
        <button
          type="button"
          class="da-btn-primary"
          slot="actions"
          autofocus
          @click=${this.close}
        >Get started</button>
      </nx-dialog>
    `;
  }
}

if (!customElements.get('nx-ew-welcome-dialog')) {
  customElements.define('nx-ew-welcome-dialog', NxEwWelcomeDialog);
}
