import { LitElement, html, nothing } from 'da-lit';

import { loadStyle, hashChange } from '../../utils/utils.js';
import {
  buildAemPathFromHashState,
  requestAemRole,
  runAemPreviewOrPublish,
} from '../../utils/aem-preview-publish.js';
import { versions, status } from '../../utils/api.js';
import { sidekickCacheBust } from '../../utils/sidekick.js';
import { getConfig } from '../../scripts/nx.js';
import '../shared/popover/popover.js';

const style = await loadStyle(import.meta.url);
const buttonStyle = await loadStyle(new URL('../../styles/buttons.css', import.meta.url).href);

const { codeBase } = getConfig();
const NX_BASE = new URL('../../', import.meta.url).href.replace(/\/$/, '');
const SEND_ICON_HREF = `${codeBase}/img/icons/s2-icon-send-20-n.svg#icon`;
const MENU_ICON_HREF = `${codeBase}/img/icons/s2-icon-more-20-n.svg#icon`;

// Inlined so the popover never depends on the consuming app's icon set being present.
const COPY_ICON = html`<svg class="deploy-glyph" viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="9" height="9" rx="1.5"></rect><path d="M4 13V5a1.5 1.5 0 0 1 1.5-1.5H12"></path></svg>`;
const CHECK_ICON = html`<svg class="deploy-glyph" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5 8 14.5 16 6"></path></svg>`;
const CLOUD_ICON = html`<svg class="deploy-glyph" viewBox="0 0 20 20" aria-hidden="true"><path d="M6.2 16a3.7 3.7 0 0 1-.5-7.36 4.6 4.6 0 0 1 8.86-.5A3.4 3.4 0 0 1 14 16H6.2Z"></path><path d="M10 13V7.4m0 0L8 9.4m2-2 2 2"></path></svg>`;

const prepareModuleUrl = () => `${window.location.origin}/blocks/canvas/editor-utils/prepare-menu.js`;

/**
 * Human-friendly timestamp for the Preview/Live cards.
 * Recent times read as "Today at 14:32" / "Yesterday at 14:32"; older ones as
 * "17 Jun, 16:02". Returns null for missing/unparseable values.
 * @param {string | number | undefined} value
 * @returns {string | null}
 */
function formatStatusTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, now)) return `Today at ${time}`;
  if (sameDay(date, yesterday)) return `Yesterday at ${time}`;
  const day = date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return `${day}, ${time}`;
}

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
    // AEM admin status ({ preview, live, ... }) for the current doc, drives the
    // deploy popover cards and the "unpublished changes" badge on the Send button.
    _status: { state: true },
    _statusLoading: { state: true },
    // Which environment the popover action targets: 'preview' | 'live'.
    _target: { state: true },
    // URL most recently copied ('preview' | 'live'), for copy-button feedback.
    _copied: { state: true },
  };

  get _prepareMenu() {
    return this.shadowRoot?.querySelector('prepare-menu');
  }

  get _prepareBtn() {
    return this.shadowRoot?.querySelector('.prepare-dropdown-btn');
  }

  get _popover() {
    return this.shadowRoot?.querySelector('nx-popover.deploy-popover');
  }

  get _sendBtn() {
    return this.shadowRoot?.querySelector('.send-btn');
  }

  get _prepareDetails() {
    return buildPrepareDetails(this._hashState);
  }

  connectedCallback() {
    super.connectedCallback();
    this._busy = false;
    this._target = 'preview';
    this.shadowRoot.adoptedStyleSheets = [style, buttonStyle];
    this._unsubHash = hashChange.subscribe((state) => {
      this._hashState = state;
      this._syncStatus();
    });
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
    clearTimeout(this._copyTimer);
  }

  // Fetch AEM admin status for the current doc. Keyed on the doc path so hash
  // updates that don't change the doc don't refetch; `force` refreshes after a
  // preview/publish so the cards and badge reflect the new state.
  async _syncStatus({ force = false } = {}) {
    const aemPath = buildAemPathFromHashState(this._hashState);
    if (!aemPath) {
      this._status = undefined;
      this._statusKey = null;
      return;
    }
    if (!force && aemPath === this._statusKey) return;
    this._statusKey = aemPath;
    this._statusLoading = true;
    try {
      const resp = await status.get(aemPath);
      if (this._statusKey !== aemPath) return; // navigated away mid-flight
      this._status = resp?.ok ? await resp.json() : undefined;
    } catch {
      if (this._statusKey === aemPath) this._status = undefined;
    } finally {
      if (this._statusKey === aemPath) this._statusLoading = false;
    }
  }

  _env(kind) {
    const env = this._status?.[kind];
    if (!env) return { ok: false, url: null, time: null };
    return { ok: env.status === 200, url: env.url || null, time: env.lastModified || null };
  }

  get _previewInfo() { return this._env('preview'); }

  get _liveInfo() { return this._env('live'); }

  // True when there is previewed content that isn't (fully) on live yet — either
  // never published, or the preview is newer than the last publish. Drives the
  // "unpublished changes" badge (issue #1197's secondary indicator).
  get _hasUnpublished() {
    const preview = this._status?.preview;
    if (preview?.status !== 200) return false;
    const live = this._status?.live;
    if (live?.status !== 200) return true;
    const previewTime = Date.parse(preview.lastModified || '');
    const liveTime = Date.parse(live.lastModified || '');
    return Number.isFinite(previewTime) && Number.isFinite(liveTime) && previewTime > liveTime;
  }

  _toggleSend() {
    const popover = this._popover;
    if (!popover) return;
    if (popover.open) {
      popover.close();
      return;
    }
    this._target = 'preview';
    this._copied = null;
    popover.show({ anchor: this._sendBtn, placement: 'below-end' });
    this._syncStatus();
  }

  _selectTarget(target) {
    this._target = target;
    this._copied = null;
  }

  async _copyUrl(url, kind) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this._copied = kind;
      clearTimeout(this._copyTimer);
      this._copyTimer = setTimeout(() => { this._copied = null; }, 1500);
    } catch { /* clipboard unavailable */ }
  }

  async _confirmAction() {
    if (this._busy) return;
    const action = this._target === 'live' ? 'publish' : 'preview';
    await this._runAemAction(action);
    if (!this._hasError) this._popover?.close();
    await this._syncStatus({ force: true });
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
    await sidekickCacheBust(url);
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

  _renderCard(kind) {
    const isPreview = kind === 'preview';
    const info = isPreview ? this._previewInfo : this._liveInfo;
    const selected = this._target === kind;
    // "Publish" is the end-user label for the live environment.
    const title = isPreview ? 'Preview' : 'Publish';
    const time = formatStatusTime(info.time);
    let sub;
    if (this._statusLoading && !this._status) sub = 'Checking status…';
    else if (info.ok && time) sub = isPreview ? `Last updated ${time}` : `Last published ${time}`;
    else sub = isPreview ? 'Not previewed yet' : 'Not published yet';

    return html`
      <div class="deploy-card deploy-card-${kind}${selected ? ' is-selected' : ''}">
        <button
          type="button"
          class="deploy-card-main"
          role="radio"
          aria-checked=${selected}
          @click=${() => this._selectTarget(kind)}
        >
          <span class="deploy-card-text">
            <span class="deploy-card-title">${title}</span>
            <span class="deploy-card-sub">${sub}</span>
          </span>
          ${selected ? html`<span class="deploy-card-check" aria-hidden="true">${CHECK_ICON}</span>` : nothing}
        </button>
        ${selected && info.ok && info.url ? html`
          <div class="deploy-url">
            <span class="deploy-url-text" title=${info.url}>${info.url}</span>
            <button
              type="button"
              class="deploy-copy"
              aria-label=${`Copy ${title} URL`}
              @click=${() => this._copyUrl(info.url, kind)}
            >${this._copied === kind ? CHECK_ICON : COPY_ICON}</button>
          </div>
        ` : nothing}
      </div>
    `;
  }

  _renderDeployPopover() {
    const isPublish = this._target === 'live';
    return html`
      <nx-popover class="deploy-popover" placement="below-end" @close=${() => { this._copied = null; }}>
        <div class="deploy">
          <div class="deploy-head">${CLOUD_ICON}<span>Deploy</span></div>
          <div class="deploy-cards" role="radiogroup" aria-label="Deploy target">
            ${this._renderCard('preview')}
            ${this._renderCard('live')}
          </div>
          <button
            type="button"
            class="deploy-action nx-btn-accent${isPublish ? ' is-publish' : ''}"
            ?disabled=${this._busy}
            @click=${this._confirmAction}
          >
            ${this._busy
        ? html`<span class="preview-dropdown-spinner" aria-hidden="true"></span>`
        : html`<span>${isPublish ? 'Publish' : 'Update'}</span>`}
          </button>
        </div>
      </nx-popover>
    `;
  }

  render() {
    const hasDoc = Boolean(buildAemPathFromHashState(this._hashState));
    const disabled = !hasDoc || this._busy;
    const prepareDetails = this._prepareReady ? this._prepareDetails : null;
    const unpublished = this._hasUnpublished;
    const sendLabel = `Preview and publish${unpublished ? ' — unpublished changes' : ''}`;

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
            <button
              type="button"
              class="nx-btn-accent send-btn${this._hasError ? ' is-error' : ''}${this._busy ? ' is-busy' : ''}"
              aria-label=${sendLabel}
              aria-haspopup="dialog"
              ?disabled=${disabled}
              @click=${this._toggleSend}
            >
              ${this._busy
        ? html`<span class="preview-dropdown-spinner" aria-hidden="true"></span>`
        : html`<svg viewBox="0 0 20 20" aria-hidden="true"><use href=${SEND_ICON_HREF}></use></svg>`}
              <span>Send</span>
              ${unpublished ? html`<span class="send-badge" aria-hidden="true"></span>` : nothing}
            </button>
            ${this._renderDeployPopover()}
          </div>
        </div>
      </div>
      ${this._renderDialog()}
    `;
  }
}

customElements.define('nx-ew-actions', NXEwActions);
