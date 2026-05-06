import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { loadIcons } from '../utils.js';

const styles = await loadStyle(import.meta.url);

export class NxBrowseActionBar extends LitElement {
  static properties = {
    count: { type: Number },
    showDelete: { type: Boolean },
    showRename: { type: Boolean },
    showDeploy: { type: Boolean },
    disabled: { type: Boolean, attribute: false },
    onDismiss: { type: Function, attribute: false },
    onAction: { type: Function, attribute: false },
    _icons: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  async firstUpdated() {
    this._icons = await loadIcons();
  }

  _invokeAction(action) {
    this.onAction?.({ action });
  }

  _handleDismiss() {
    this.onDismiss?.();
  }

  _renderIcon(iconKey) {
    const svg = this._icons?.[iconKey];
    return svg ? svg.cloneNode(true) : nothing;
  }

  render() {
    const n = this.count ?? 0;
    const label = n === 1 ? '1 item selected' : `${n} items selected`;

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
          ${this.showDeploy
            ? html`
                      <button
                        type="button"
                        class="action action-preview"
                        ?disabled=${this.disabled}
                        aria-label="Preview selected"
                        @click=${() => this._invokeAction('preview')}
                      >
                        ${this._renderIcon('preview')}
                        <span class="action-label">Preview</span>
                      </button>
                      <button
                        type="button"
                        class="action"
                        ?disabled=${this.disabled}
                        aria-label="Publish selected"
                        @click=${() => this._invokeAction('publish')}
                      >
                        ${this._renderIcon('publish')}
                        <span class="action-label">Publish</span>
                      </button>
                    `
            : nothing}
          ${this.showDelete
            ? html`
                <button
                  type="button"
                  class="action"
                  ?disabled=${this.disabled}
                  aria-label="Delete selected"
                  @click=${() => this._invokeAction('delete')}
                >
                  ${this._renderIcon('delete')}
                  <span class="action-label">Delete</span>
                </button>
              `
            : nothing}
          ${this.showRename
            ? html`
                <button
                  type="button"
                  class="action"
                  ?disabled=${this.disabled}
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
