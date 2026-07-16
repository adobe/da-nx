import { LitElement, html, nothing } from 'da-lit';

import { loadStyle, hashChange } from '../../utils/utils.js';
import {
  buildAemPathFromHashState,
  requestAemRole,
  runAemPreviewOrPublish,
} from '../../utils/aem-preview-publish.js';
import { versions } from '../../utils/api.js';
import { getConfig } from '../../scripts/nx.js';
import '../shared/popover/popover.js';

const style = await loadStyle(import.meta.url);
const { codeBase } = getConfig();
const NX_BASE = new URL('../../', import.meta.url).href.replace(/\/$/, '');
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
    _hasError: { state: true },
    _hashState: { state: true },
    _prepareReady: { state: true },
    // phase: 'error' | 'pending' | 'result'
    _dialog: { state: true },
  };

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
    return this.shadowRoot?.querySelector('.prepare-dropdown-btn');
  }

  get _prepareDetails() {
    return buildPrepareDetails(this._hashState);
  }

  connectedCallback() {
    super.connectedCallback();
    this._busy = false;
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
    const btn = this._prepareBtn;
    const menu = this._prepareMenu;
    if (!btn || !menu) return;
    if (btn.getAttribute('aria-expanded') === 'true') {
      menu.toggle(btn);
    } else {
      menu.toggle(btn);
      btn.setAttribute('aria-expanded', 'true');
    }
  }

  _onPrepareMenuClose() {
    this._prepareBtn?.setAttribute('aria-expanded', 'false');
  }

  _onSendPopoverClose() {
    this._menuAnchor?.setAttribute('aria-expanded', 'false');
  }

  async _handleRoleRequest() {
    const { org, site } = this._hashState || {};
    const { action } = this._dialog?.error || {};
    this._dialog = { phase: 'pending' };
    try {
      const { message } = await requestAemRole(org, site, action);
      this._dialog = { phase: 'result', message };
    } catch {
      this._dialog = { phase: 'result', message: ['An error occurred.', 'Please try again.'] };
    }
  }

  _pickAem(action) {
    if (action !== 'preview' && action !== 'publish') return;
    this._popover?.close();
    this._runAemAction(action);
  }

  async _runAemAction(action) {
    const aemPath = buildAemPathFromHashState(this._hashState);
    if (!aemPath || this._busy) return;

    this._dialog = undefined;
    this._busy = true;

    const result = await runAemPreviewOrPublish({ aemPath, action });
    if (!result.ok) {
      await Promise.all([
        import('../shared/dialog/dialog.js'),
        import(`${NX_BASE}/public/sl/components.js`),
      ]);
      this._busy = false;
      this._hasError = true;
      this._dialog = { phase: 'error', error: result.error };
      return;
    }

    this._hasError = false;
    const url = this._resolveOpenUrl(action, aemPath, result.url);
    window.open(url, url);
    this._saveVersion(action);
    this._busy = false;
  }

  _saveVersion(action) {
    const fullpath = this._prepareDetails?.fullpath;
    if (!fullpath) return;
    const comment = action === 'publish' ? 'Published' : 'Previewed';
    // eslint-disable-next-line no-console
    versions.create(fullpath, { comment }).catch(() => console.log(`Error creating auto version (${comment}).`));
  }

  // A page can override the EDS delivery URL with `preview-url` / `live-url`
  // metas whose content is a template containing `${aemPath}`.
  // eslint-disable-next-line class-methods-use-this
  _resolveOpenUrl(action, aemPath, fallbackUrl) {
    const metaName = action === 'publish' ? 'live-url' : 'preview-url';
    const template = document.head.querySelector(`meta[name="${metaName}"]`)?.content;
    if (!template) return fallbackUrl;
    // eslint-disable-next-line no-template-curly-in-string
    const url = template.replace('${aemPath}', aemPath);
    // aemPath carries a leading slash, so a template like `.../preview/${aemPath}`
    // yields `preview//...`; collapse duplicate slashes but keep the `://` scheme.
    return url.replace(/([^:])\/{2,}/g, '$1/');
  }

  _renderDialog() {
    if (!this._dialog) return nothing;
    const { phase, error, message } = this._dialog;
    const close = () => { this._dialog = undefined; };
    const is403 = phase === 'error' && error?.status === 403;
    const actionLabel = error?.action === 'publish' ? 'Publish' : 'Preview';

    let title = 'Role request';
    if (phase === 'error') title = is403 ? 'Not authorized' : `${actionLabel} failed`;

    let body;
    if (phase === 'error') {
      body = html`<p>${error?.message}</p>${error?.details ? html`<p>${error.details}</p>` : nothing}`;
    } else if (phase === 'pending') {
      body = html`<p>Requesting permissions...</p>`;
    } else {
      body = html`<p>${message?.[0]}</p><p>${message?.[1]}</p>`;
    }

    return html`
      <nx-dialog title=${title} @close=${close}>
        <div class="role-request-body">${body}</div>
        ${phase === 'error' && is403 ? html`
          <sl-button slot="actions" @click=${this._handleRoleRequest}>Request access</sl-button>
        ` : nothing}
        ${phase === 'error' && !is403 ? html`
          <sl-button slot="actions" @click=${() => this.shadowRoot.querySelector('nx-dialog').close()}>Dismiss</sl-button>
        ` : nothing}
        ${phase !== 'error' ? html`
          <sl-button
            slot="actions"
            ?disabled=${phase === 'pending'}
            @click=${() => this.shadowRoot.querySelector('nx-dialog').close()}
          >OK</sl-button>
        ` : nothing}
      </nx-dialog>
    `;
  }

  render() {
    const hasDoc = Boolean(buildAemPathFromHashState(this._hashState));
    const disabled = !hasDoc || this._busy;
    const prepareDetails = this._prepareReady ? this._prepareDetails : null;

    return html`
      <div class="ew-actions">
        <div class="right">
          <div class="preview-row">
            ${prepareDetails ? html`
              <button
                type="button"
                class="prepare-dropdown-btn"
                aria-label="Open prepare menu"
                aria-haspopup="menu"
                aria-expanded="false"
                @click=${this._togglePrepareMenu}
              >
                <svg class="prepare-dropdown-btn-icon" viewBox="0 0 20 20" aria-hidden="true"><use href=${PREPARE_ICON_HREF}></use></svg>
              </button>
              <prepare-menu .details=${prepareDetails} @close=${this._onPrepareMenuClose}></prepare-menu>
            ` : nothing}
            <button
              type="button"
              class="preview-dropdown-btn${this._hasError ? ' is-error' : ''}${this._busy ? ' is-busy' : ''}"
              aria-label="Preview and publish"
              aria-haspopup="menu"
              aria-expanded="false"
              ?disabled=${disabled}
              @click=${this._togglePreviewPopover}
            >
              ${this._busy
                ? html`<span class="preview-dropdown-spinner" aria-hidden="true"></span>`
                : html`<svg class="preview-dropdown-icon" viewBox="0 0 20 20" aria-hidden="true"><use href=${SEND_ICON_HREF}></use></svg>`}
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
        </div>
      </div>
      ${this._renderDialog()}
    `;
  }
}

customElements.define('nx-ew-actions', NXEwActions);
