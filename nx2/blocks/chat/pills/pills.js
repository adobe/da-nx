import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { getConfig } from '../../../scripts/nx.js';
import { fileIconName } from '../utils/icons.js';

const styles = await loadStyle(import.meta.url);
const { codeBase } = getConfig();

class NxChatPills extends LitElement {
  static properties = { items: { type: Array } };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _remove(id) {
    this.dispatchEvent(new CustomEvent('nx-pill-remove', { detail: { id } }));
  }

  _pillTypeIcon(label, thumbnail) {
    if (thumbnail) return html`<img class="pill-thumbnail" src=${thumbnail} alt="" aria-hidden="true">`;
    return html`<svg class="pill-type-icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/${fileIconName(label)}.svg#icon"></use></svg>`;
  }

  _renderPill({ id, label, thumbnail, type }) {
    return html`
      <li class="pill">
        <button
          class="pill-icon"
          type="button"
          aria-label="Remove ${label}"
          @click=${() => this._remove(id)}
        ><svg viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-close-20-n.svg#icon"></use></svg></button>
        ${type === 'image' || type === 'file' ? this._pillTypeIcon(label, thumbnail) : nothing}
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
