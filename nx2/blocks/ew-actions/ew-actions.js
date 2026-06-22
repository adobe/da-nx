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
const PREPARE_ICON_HREF = `${codeBase}/img/icons/s2-icon-filetext-20-n.svg#icon`;

const prepareModuleUrl = () => `${window.location.origin}/blocks/canvas/editor-utils/prepare-menu.js`;

/** @param {string} segment */
const withHtmlExt = (segment) => {
  if (!segment || segment.endsWith('/') || /\.(html|json)$/.test(segment)) return segment;
  return `${segment}.html`;
};

/**
 * Shape expected by da-prepare and its OOTB actions (matches da.live pathDetails).
 * @param {{ org?: string, site?: string, path?: string, fullpath?: string } | null} state
 */
function buildPrepareDetails(state) {
  const { org, site, path } = state || {};
  if (!org || !site || !path) return null;

  const docPath = path.startsWith('/') ? path : `/${path}`;
  const pathname = withHtmlExt(docPath);
  let fullpath = state.fullpath || `/${org}/${site}${pathname}`;
  if (!fullpath.startsWith('/')) fullpath = `/${fullpath}`;
  fullpath = withHtmlExt(fullpath);

  return {
    org,
    site,
    owner: org,
    repo: site,
    path: pathname,
    fullpath,
    view: 'edit',
  };
}

class NXEwActions extends LitElement {
  static properties = {
    _busy: { state: true },
    _error: { state: true },
    _hashState: { state: true },
    _prepareReady: { state: true },
  };

  _busy = false;

  get _popover() {
    return this.shadowRoot?.querySelector('nx-popover');
  }

  get _menuAnchor() {
    return this.shadowRoot?.querySelector('.preview-dropdown-btn');
  }

  get _prepareMenu() {
    return this.shadowRoot?.querySelector('prepare-menu');
  }

  get _prepareBtn() {
    return this.shadowRoot?.querySelector('.prepare-btn');
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._unsubHash = hashChange.subscribe((state) => { this._hashState = state; });
    this._loadPrepare();
  }

  async _loadPrepare() {
    if (this._prepareReady) return;
    try {
      await import(prepareModuleUrl());
      if (!this.isConnected) return;
      this._prepareReady = true;
    } catch {
      /* prepare menu unavailable (e.g. module load failure) */
    }
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

  _togglePrepareMenu(e) {
    e.preventDefault();
    this._prepareMenu?.toggle(this._prepareBtn);
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
    const prepareDetails = this._prepareReady ? buildPrepareDetails(this._hashState) : null;

    return html`
      <div class="ew-actions">
        <div class="right">
          <div class="preview-row">
            ${prepareDetails ? html`
              <button
                type="button"
                class="prepare-btn"
                aria-label="Open prepare menu"
                aria-haspopup="menu"
                @click=${this._togglePrepareMenu}
              >
                <svg class="prepare-btn-icon" viewBox="0 0 20 20" aria-hidden="true"><use href=${PREPARE_ICON_HREF}></use></svg>
              </button>
              <prepare-menu .details=${prepareDetails}></prepare-menu>
            ` : nothing}
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
