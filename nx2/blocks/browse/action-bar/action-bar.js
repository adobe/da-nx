import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { loadIcons } from '../utils.js';

const styles = await loadStyle(import.meta.url);

export class NxBrowseActionBar extends LitElement {
  static properties = {
    count: { type: Number },
    hasDeleteAction: { type: Boolean, attribute: false },
    hasRenameAction: { type: Boolean, attribute: false },
    hasDeployAction: { type: Boolean, attribute: false },
    isDisabled: { type: Boolean, attribute: false },
    _icons: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  async firstUpdated() {
    this._icons = await loadIcons();
  }

  _emitEvent(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  _invokeAction(action) {
    this._emitEvent('nx-browse-selection-action', { action });
  }

  _handleDismiss() {
    this._emitEvent('nx-browse-selection-dismiss');
  }

  _renderIcon(iconKey) {
    const svg = this._icons?.[iconKey];
    return svg ? svg.cloneNode(true) : nothing;
  }

  render() {
    const selectedCount = this.count ?? 0;
    const label = selectedCount === 1 ? '1 item selected' : `${selectedCount} items selected`;

    return html`
      <div class="bar" role="toolbar" aria-label="Selection actions">
        <div class="bar-lead">
          <button
            type="button"
            class="dismiss"
            aria-label="Clear selection"
            @click=${this._handleDismiss}
          >
            ${this._icons?.close ? this._icons.close.cloneNode(true) : nothing}
          </button>
          <span class="count" title=${label}>${label}</span>
        </div>
        <div class="actions">
          ${this.hasDeployAction
            ? html`
                      <button
                        type="button"
                        class="action action-preview"
                        ?disabled=${this.isDisabled}
                        aria-label="Preview selected"
                        @click=${() => this._invokeAction('preview')}
                      >
                        ${this._renderIcon('preview')}
                        <span class="action-label">Preview</span>
                      </button>
                      <button
                        type="button"
                        class="action"
                        ?disabled=${this.isDisabled}
                        aria-label="Publish selected"
                        @click=${() => this._invokeAction('publish')}
                      >
                        ${this._renderIcon('publish')}
                        <span class="action-label">Publish</span>
                      </button>
                    `
            : nothing}
          ${this.hasDeleteAction
            ? html`
                <button
                  type="button"
                  class="action"
                  ?disabled=${this.isDisabled}
                  aria-label="Delete selected"
                  @click=${() => this._invokeAction('delete')}
                >
                  ${this._renderIcon('delete')}
                  <span class="action-label">Delete</span>
                </button>
              `
            : nothing}
          ${this.hasRenameAction
            ? html`
                <button
                  type="button"
                  class="action"
                  ?disabled=${this.isDisabled}
                  aria-label="Rename selected"
                  @click=${() => this._invokeAction('rename')}
                >
                  ${this._renderIcon('rename')}
                  <span class="action-label">Rename</span>
                </button>
              `
            : nothing}
        </div>
      </div>
    `;
  }
}

customElements.define('nx-browse-action-bar', NxBrowseActionBar);
