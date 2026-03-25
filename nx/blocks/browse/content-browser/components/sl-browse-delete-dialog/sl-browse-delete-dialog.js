// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';

const style = await getStyle(import.meta.url);

/**
 * Delete confirmation dialog.
 *
 * @fires sl-browse-delete-dialog-close
 * @fires sl-browse-delete-dialog-cancel
 * @fires sl-browse-delete-dialog-confirm
 * @customElement sl-browse-delete-dialog
 */
export class SlBrowseDeleteDialog extends LitElement {
  static properties = {
    open: { type: Boolean },
    loading: { type: Boolean },
    intro: { type: String },
    /** @type {string[]} */
    paths: { type: Array },
  };

  constructor() {
    super();
    this.open = false;
    this.loading = false;
    this.intro = '';
    this.paths = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  _onClose() {
    if (this.loading) return;
    this.dispatchEvent(new CustomEvent('sl-browse-delete-dialog-close', { bubbles: true, composed: true }));
  }

  _onCancel() {
    if (this.loading) return;
    this.dispatchEvent(new CustomEvent('sl-browse-delete-dialog-cancel', { bubbles: true, composed: true }));
  }

  _onConfirm() {
    if (this.loading) return;
    this.dispatchEvent(new CustomEvent('sl-browse-delete-dialog-confirm', { bubbles: true, composed: true }));
  }

  render() {
    return html`
      <sp-dialog-wrapper
        class="sl-browse-delete-dialog"
        size="s"
        headline="Delete"
        cancel-label="Cancel"
        confirm-label="Delete"
        underlay
        ?open="${this.open}"
        @close="${this._onClose}"
        @cancel="${this._onCancel}"
        @confirm="${this._onConfirm}"
      >
        <div class="sl-browse-delete-dialog-body">
          <p class="sl-browse-delete-dialog-intro">${this.intro}</p>
          ${this.paths.length > 0
        ? html`
                <ul class="sl-browse-delete-dialog-path-list">
                  ${this.paths.map((p) => html`<li class="sl-browse-delete-dialog-path-item">${p}</li>`)}
                </ul>
              `
        : ''}
        </div>
      </sp-dialog-wrapper>
    `;
  }
}

customElements.define('sl-browse-delete-dialog', SlBrowseDeleteDialog);
