import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { iconClassFromName } from '../../shared/utils/icons.js';

const styles = await loadStyle(import.meta.url);

class NxChatPills extends LitElement {
  static properties = {
    items: { type: Array },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _remove(id) {
    this.dispatchEvent(new CustomEvent('nx-pill-remove', { detail: { id } }));
  }

  _pillTypeIcon(label, thumbnail) {
    if (thumbnail) return html`<img class="pill-thumbnail" src=${thumbnail} alt="" aria-hidden="true">`;
    return html`<span class="pill-type-icon ${iconClassFromName(label)}" aria-hidden="true"></span>`;
  }

  _renderPill({ id, label, thumbnail }) {
    return html`
      <li class="pill">
        <button
          class="pill-icon"
          type="button"
          aria-label="Remove ${label}"
          @click=${() => this._remove(id)}
        ></button>
        ${this._pillTypeIcon(label, thumbnail)}
        <span class="pill-label" title=${label}>${label}</span>
      </li>
    `;
  }

  render() {
    if (!this.items?.length) return nothing;
    return html`
      <ul class="pills-container" aria-label="Attached items" aria-live="polite">
        ${this.items.map((item) => this._renderPill(item))}
      </ul>
    `;
  }
}

customElements.define('nx-chat-pills', NxChatPills);
