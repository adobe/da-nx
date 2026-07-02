import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { getConfig } from '../../../scripts/nx.js';
import { pillIconName } from '../utils/icons.js';

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

  _pin(id) {
    this.dispatchEvent(new CustomEvent('nx-pill-pin', { detail: { id } }));
  }

  _activate(id) {
    this.dispatchEvent(new CustomEvent('nx-pill-activate', { detail: { id } }));
  }

  _pillTypeIcon(type, label, thumbnail) {
    if (thumbnail) return html`<img class="pill-thumbnail" src=${thumbnail} alt="" aria-hidden="true">`;
    const iconName = pillIconName(type, label);
    return html`<svg class="pill-type-icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/${iconName}.svg#icon"></use></svg>`;
  }

  _renderPill({
    id, label, thumbnail, type, pinnable, pinned,
  }) {
    const showPin = pinnable && !pinned;
    const action = showPin
      ? html`<button
          class="pill-icon pill-pin"
          type="button"
          aria-label="Pin ${label}"
          @click=${() => this._pin(id)}
        ><svg viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-pinon-20-n.svg#icon"></use></svg></button>`
      : html`<button
          class="pill-icon"
          type="button"
          aria-label="Remove ${label}"
          @click=${() => this._remove(id)}
        ><svg viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-close-20-n.svg#icon"></use></svg></button>`;
    const labelEl = pinnable
      ? html`<button
          class="pill-label pill-label-button"
          type="button"
          title=${label}
          @click=${() => this._activate(id)}
        >${label}</button>`
      : html`<span class="pill-label" title=${label}>${label}</span>`;
    const showTypeIcon = type === 'image' || type === 'file' || type === 'folder' || type === 'block' || type === 'text';
    return html`
      <li class="pill">
        ${action}
        ${showTypeIcon ? this._pillTypeIcon(type, label, thumbnail) : nothing}
        ${labelEl}
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
