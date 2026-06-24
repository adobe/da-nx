import { LitElement, html } from 'da-lit';

import { getConfig } from '../../scripts/nx.js';
import { loadStyle } from '../../utils/utils.js';

const { codeBase } = getConfig();

const style = await loadStyle(import.meta.url);

const ICON_HREF = `${codeBase}/img/icons/s2-icon-splitleft-20-n.svg#icon`;

// The form's own header: a slim bar with the chat toggle. Emits
// `form-toggle-chat`; exposes the toggle as a part so the workspace CSS can hide it.
class NxFormHeader extends LitElement {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  _toggleChat() {
    this.dispatchEvent(
      new CustomEvent('form-toggle-chat', { bubbles: true, composed: true }),
    );
  }

  render() {
    return html`
      <header class="bar" part="bar">
        <div class="group group-start" part="group-start">
          <button
            type="button"
            class="icon-btn"
            part="btn toggle-before"
            aria-label="Toggle chat"
            @click=${this._toggleChat}
          >
            <svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="${ICON_HREF}"></use></svg>
          </button>
        </div>
      </header>
    `;
  }
}

if (!customElements.get('nx-form-header')) {
  customElements.define('nx-form-header', NxFormHeader);
}
