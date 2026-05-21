import { LitElement, html, nothing } from 'da-lit';

import { loadStyle, hashChange } from '../../utils/utils.js';
import {
  buildAemPathFromHashState,
  formatAemPreviewPublishError,
  runAemPreviewOrPublish,
} from '../../utils/aem-preview-publish.js';
import { getConfig } from '../../scripts/nx.js';
import '../shared/popover/popover.js';

const style = await loadStyle(import.meta.url);
const { codeBase } = getConfig();
const SEND_ICON_HREF = `${codeBase}/img/icons/s2-icon-send-20-n.svg#icon`;

class NXEwActions extends LitElement {
  static properties = {
    _busy: { state: true },
    _error: { state: true },
    _hashState: { state: true },
  };

  _busy = false;

  get _popover() {
    return this.shadowRoot?.querySelector('nx-popover');
  }

  get _menuAnchor() {
    return this.shadowRoot?.querySelector('.preview-dropdown-btn');
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._unsubHash = hashChange.subscribe((state) => { this._hashState = state; });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubHash?.();
  }

  _togglePreviewPopover(e) {
    e.preventDefault();
    if (!buildAemPathFromHashState(this._hashState) || this._busy) return;
    const pop = this._popover;
    const anchor = this._menuAnchor;
    if (!pop || !anchor) return;
    if (pop.open) {
      pop.close();
    } else {
      pop.show({ anchor, placement: 'below' });
      anchor.setAttribute('aria-expanded', 'true');
    }
  }

  _onSendPopoverClose() {
    this._menuAnchor?.setAttribute('aria-expanded', 'false');
  }

  _pickAem(action) {
    if (action !== 'preview' && action !== 'publish') return;
    this._popover?.close();
    this._runAemAction(action);
  }

  async _runAemAction(action) {
    const aemPath = buildAemPathFromHashState(this._hashState);
    if (!aemPath || this._busy) return;

    this._error = undefined;
    this._busy = true;

    const result = await runAemPreviewOrPublish({ aemPath, action });
    if (!result.ok) {
      this._error = formatAemPreviewPublishError(result.error);
      this._busy = false;
      return;
    }

    window.open(result.url, result.url);

    this._busy = false;
  }

  render() {
    const hasDoc = Boolean(buildAemPathFromHashState(this._hashState));
    const disabled = !hasDoc || this._busy;

    return html`
      <div class="ew-actions">
        <div class="right">
          <div class="preview-row">
            <button
              type="button"
              class="preview-dropdown-btn"
              aria-label="Preview and publish"
              aria-haspopup="menu"
              aria-expanded="false"
              ?disabled=${disabled}
              @click=${this._togglePreviewPopover}
            >
              <svg class="preview-dropdown-icon" viewBox="0 0 20 20" aria-hidden="true"><use href=${SEND_ICON_HREF}></use></svg>
            </button>
            <nx-popover placement="below" @close=${this._onSendPopoverClose}>
              <div class="send-popover" role="menu">
                <button type="button" class="send-popover-item" role="menuitem" @click=${() => this._pickAem('preview')}>
                  Preview
                </button>
                <button type="button" class="send-popover-item" role="menuitem" @click=${() => this._pickAem('publish')}>
                  Publish
                </button>
              </div>
            </nx-popover>
          </div>
          ${this._error ? html`<p class="action-error" role="alert">${this._error}</p>` : nothing}
        </div>
      </div>
    `;
  }
}

customElements.define('nx-ew-actions', NXEwActions);
