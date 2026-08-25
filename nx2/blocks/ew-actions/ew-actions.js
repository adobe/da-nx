import { LitElement, html, nothing } from 'da-lit';

import { loadStyle, hashChange } from '../../utils/utils.js';
import {
  buildAemPathFromHashState,
  requestAemRole,
  runAemPreviewOrPublish,
} from '../../utils/aem-preview-publish.js';
import { versions, getAemSiteToken } from '../../utils/api.js';
import { getConfig } from '../../scripts/nx.js';
import '../shared/menu/menu.js';

const style = await loadStyle(import.meta.url);
const buttonStyle = await loadStyle(new URL('../../styles/buttons.css', import.meta.url).href);

const { codeBase } = getConfig();
const NX_BASE = new URL('../../', import.meta.url).href.replace(/\/$/, '');
const SEND_ICON_HREF = `${codeBase}/img/icons/s2-icon-send-20-n.svg#icon`;
const MENU_ICON_HREF = `${codeBase}/img/icons/s2-icon-more-20-n.svg#icon`;
const PASTE_ICON_HREF = `${codeBase}/img/icons/s2-icon-paste-20-n.svg#icon`;
const CHECKMARK_ICON_HREF = `${codeBase}/img/icons/s2-icon-checkmark-20-n.svg#icon`;

// `da-sc` (structured-content delivery) only authenticates via `Authorization: token <secret>`,
// which a plain `window.open` navigation can never attach. Preview/live URLs resolving here are
// fetched in-app with a site token instead of navigated to. See adobe/da-nx#685.
const DA_SC_ORIGIN = 'https://da-sc.adobeaem.workers.dev';

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
    // { action, url, json } | { action, url, error }
    _scPreview: { state: true },
    _scCopyDone: { state: true },
  };

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
    this.shadowRoot.adoptedStyleSheets = [style, buttonStyle];
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
    this._runAemAction(action);
  }

  async _runAemAction(action) {
    const aemPath = buildAemPathFromHashState(this._hashState);
    if (!aemPath || this._busy) return;

    this._dialog = undefined;
    this._busy = true;

    // Flush pending collab updates to da-admin before AEM reads it,
    // otherwise the last ~2s of edits (held in da-collab's debounce) are missed.
    const editorDoc = document.querySelector('ew-editor-doc');
    if (editorDoc?.forceSave) {
      const flushResult = await editorDoc.forceSave();
      if (!flushResult?.ok) {
        await Promise.all([
          import('../shared/dialog/dialog.js'),
          import(`${NX_BASE}/public/sl/components.js`),
        ]);
        this._busy = false;
        this._hasError = true;
        this._dialog = {
          phase: 'error',
          error: {
            action,
            type: 'error',
            message: flushResult?.error || 'Unable to confirm save. Please retry or reload the editor.',
          },
        };
        return;
      }
    }

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
    this._saveVersion(action);

    if (new URL(url).origin === DA_SC_ORIGIN) {
      await this._openStructuredContentPreview(url, action);
    } else {
      window.open(url, url);
    }
    this._busy = false;
  }

  // `da-sc` only accepts `Authorization: token <secret>`, which a browser navigation can't
  // attach — fetch it in-app with the site's token and show the result in a dialog instead.
  async _openStructuredContentPreview(url, action) {
    const { org, site } = this._hashState || {};
    const result = await getAemSiteToken({ org, site });
    // Response field name isn't pinned down anywhere in this codebase — same hedge as
    // nx/blocks/importer/index.js.
    const siteToken = result?.siteToken || result?.token;

    let json;
    let error;
    if (!siteToken) {
      error = { message: 'Could not obtain a site token to authenticate this request.' };
    } else {
      try {
        const resp = await fetch(url, { headers: { Authorization: `token ${siteToken}` } });
        if (resp.ok) {
          json = await resp.json();
        } else {
          error = { status: resp.status, message: `Request failed (${resp.status}).` };
        }
      } catch (e) {
        error = { message: e?.message || 'Network error.' };
      }
    }

    await Promise.all([
      import('../shared/dialog/dialog.js'),
      import(`${NX_BASE}/public/sl/components.js`),
    ]);
    this._scCopyDone = false;
    this._scPreview = {
      action, url, json, error,
    };
  }

  async _copyScPreviewUrl() {
    if (!this._scPreview?.url) return;
    try {
      await navigator.clipboard.writeText(this._scPreview.url);
      this._scCopyDone = true;
      setTimeout(() => { this._scCopyDone = false; }, 2000);
    } catch {
      /* clipboard unavailable; url is still visible/selectable in the dialog */
    }
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

  _renderScPreviewDialog() {
    if (!this._scPreview) return nothing;
    const {
      action, url, json, error,
    } = this._scPreview;
    const title = action === 'publish' ? 'Publish' : 'Preview';
    const close = () => { this._scPreview = undefined; };

    return html`
      <nx-dialog title=${title} style="--nx-dialog-max-width: 720px" @close=${close}>
        <div class="sc-preview-body">
          <div class="sc-preview-url-row">
            <input class="sc-preview-url" type="text" readonly .value=${url} @click=${(e) => e.target.select()} />
            <button
              type="button"
              class="sc-preview-copy ${this._scCopyDone ? 'is-done' : ''}"
              aria-label="Copy URL"
              @click=${() => this._copyScPreviewUrl()}
            >
              <svg class="icon-paste" viewBox="0 0 20 20" aria-hidden="true"><use href=${PASTE_ICON_HREF}></use></svg>
              <svg class="icon-checkmark" viewBox="0 0 20 20" aria-hidden="true"><use href=${CHECKMARK_ICON_HREF}></use></svg>
            </button>
          </div>
          <p class="sc-preview-note">
            If this site requires authentication, opening this URL directly (e.g. in a browser
            tab) might 401 — it would need an <code>Authorization: token &lt;site-secret&gt;</code>
            header, which only a programmatic request (e.g. curl) can attach.
          </p>
          ${error ? html`
            <p class="sc-preview-error">${error.message}</p>
          ` : html`
            <pre class="sc-preview-json"><code>${JSON.stringify(json, null, 2)}</code></pre>
          `}
        </div>
        <sl-button slot="actions" @click=${() => this.shadowRoot.querySelector('nx-dialog').close()}>Close</sl-button>
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
                class="nx-action-btn-icon prepare-dropdown-btn"
                aria-label="Open prepare menu"
                aria-haspopup="menu"
                aria-expanded="false"
                @click=${this._togglePrepareMenu}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true"><use href=${MENU_ICON_HREF}></use></svg>
              </button>
              <prepare-menu .details=${prepareDetails} @close=${this._onPrepareMenuClose}></prepare-menu>
            ` : nothing}
            <nx-menu
              placement="below"
              size="m"
              .items=${[
        { id: 'preview', label: 'Preview' },
        { id: 'publish', label: 'Publish' },
      ]}
              @select=${(e) => this._pickAem(e.detail.id)}
            >
              <button
                type="button"
                slot="trigger"
                class="nx-btn-accent preview-dropdown-btn${this._hasError ? ' is-error' : ''}${this._busy ? ' is-busy' : ''}"
                aria-label="Preview and publish"
                ?disabled=${disabled}
              >
                ${this._busy
        ? html`<span class="preview-dropdown-spinner" aria-hidden="true"></span>`
        : html`<svg viewBox="0 0 20 20" aria-hidden="true"><use href=${SEND_ICON_HREF}></use></svg>`}
        <span>Send</span>
              </button>
            </nx-menu>
          </div>
        </div>
      </div>
      ${this._renderDialog()}
      ${this._renderScPreviewDialog()}
    `;
  }
}

customElements.define('nx-ew-actions', NXEwActions);
