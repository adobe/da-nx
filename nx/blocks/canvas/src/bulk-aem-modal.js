// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html, nothing } from 'da-lit';
import { initIms } from '../../../utils/daFetch.js';
import { Queue } from '../../../public/utils/tree.js';

const style = await getStyle(import.meta.url);

/** @typedef {'preview'|'publish'|'delete'} BulkAemMode */

export const DA_BULK_AEM_OPEN = 'da-bulk-aem-open';
export const DA_BULK_AEM_SETTLED = 'da-bulk-aem-settled';

const AEM_ORIGIN = 'https://admin.hlx.page';

/**
 * @param {string} path - Full pathname e.g. /org/site/path/to/page.html
 * @returns {string | null}
 */
function normalizeAemPath(path) {
  const raw = (path || '').replace(/^\//, '').trim();
  if (!raw) return null;
  const full = `/${raw}`;
  const segments = full.slice(1).split('/').filter(Boolean);
  return segments.length >= 2 ? full : null;
}

/**
 * @param {string} path
 * @param {'preview'|'live'} action
 * @param {'POST'|'DELETE'} method
 */
async function aemRequest(path, action, method) {
  const norm = normalizeAemPath(path);
  if (!norm) return { ok: false, status: 0, message: 'Invalid path' };
  const [owner, repo, ...parts] = norm.slice(1).toLowerCase().split('/');
  const aemPath = parts.join('/');
  const url = `${AEM_ORIGIN}/${action}/${owner}/${repo}/main/${aemPath}`;
  const ims = await initIms();
  const bearer = ims?.accessToken?.token ? `Bearer ${ims.accessToken.token}` : '';
  const resp = await fetch(url, {
    method,
    headers: {
      ...(bearer ? { Authorization: bearer, 'x-content-source-authorization': bearer } : {}),
    },
  });
  if (!resp.ok) {
    const xError = resp.headers.get('x-error');
    return {
      ok: false,
      status: resp.status,
      message: xError || resp.statusText || String(resp.status),
    };
  }
  return { ok: true, status: resp.status, message: 'OK' };
}

/**
 * Modal to preview, publish, or delete multiple pages via AEM admin
 * (same contract as single-file actions in da-space).
 *
 * Open from canvas: dispatch on `da-space` (or any ancestor that listens)
 * a `da-bulk-aem-open` event with `bubbles` and `composed`, and
 * `detail: { files: string[], mode: 'preview'|'publish'|'delete' }`.
 *
 * Or call `show(files, mode)` on the element reference.
 *
 * `files` are full repo paths (`org/repo/.../page.html` or `/org/repo/...`).
 *
 * @fires da-bulk-aem-settled - once when the overlay closes after `show()`:
 *   cancelled (no run / dismissed early) or completed (after at least one run; includes results).
 */
class DaBulkAemModal extends LitElement {
  static properties = {
    /** @type {string[]} */
    files: { type: Array },
    /** @type {BulkAemMode} */
    mode: { type: String },
    _overlayOpen: { state: true },
    /** @type {Array<{ path: string, message?: string,
     *   state: 'pending'|'running'|'ok'|'error' }>} */
    _rows: { state: true },
    _running: { state: true },
    /** @type {boolean} */
    _postRun: { state: true },
    /** @type {boolean} */
    _runHasFailures: { state: true },
  };

  constructor() {
    super();
    this.files = [];
    this.mode = 'preview';
    this._overlayOpen = false;
    this._rows = [];
    this._running = false;
    this._postRun = false;
    this._runHasFailures = false;
    /** @private Prevents duplicate settlement when overlay closes after a completed run. */
    this._settlementEmitted = false;
    /** @type {Record<string, unknown> | null} */
    this._pendingSettleDetail = null; // settle payload after user closes post-run
  }

  /**
   * @param {string[]} files
   * @param {BulkAemMode} [mode]
   */
  show(files, mode) {
    const list = Array.isArray(files)
      ? files.map((p) => (typeof p === 'string' ? p.replace(/^\//, '').trim() : '')).filter(Boolean)
      : [];
    this.files = list;
    if (mode === 'preview' || mode === 'publish' || mode === 'delete') {
      this.mode = mode;
    }
    this._rows = list.map((path) => ({ path, state: 'pending', message: '' }));
    this._running = false;
    this._postRun = false;
    this._runHasFailures = false;
    this._pendingSettleDetail = null;
    this._settlementEmitted = false;
    this._overlayOpen = true;
    this.requestUpdate();
  }

  _emitSettled(detail) {
    if (this._settlementEmitted) return;
    this._settlementEmitted = true;
    this.dispatchEvent(new CustomEvent(DA_BULK_AEM_SETTLED, {
      bubbles: true,
      composed: true,
      detail,
    }));
  }

  _onOverlayClosed = () => {
    this._overlayOpen = false;
    if (!this._settlementEmitted) {
      if (this._pendingSettleDetail != null) {
        this._emitSettled(this._pendingSettleDetail);
        this._pendingSettleDetail = null;
      } else {
        this._emitSettled({
          kind: 'cancelled',
          cancelled: true,
          message: 'User dismissed the bulk dialog before finishing.',
        });
      }
    }
    this.requestUpdate();
  };

  _headlineForMode() {
    switch (this.mode) {
      case 'publish':
        return 'Bulk publish';
      case 'delete':
        return 'Bulk delete (live)';
      default:
        return 'Bulk preview';
    }
  }

  _goLabel() {
    switch (this.mode) {
      case 'publish':
        return 'Publish';
      case 'delete':
        return 'Delete';
      default:
        return 'Preview';
    }
  }

  _goVariant() {
    return this.mode === 'delete' ? 'negative' : 'accent';
  }

  /** Failed rows after the latest run (for error panel). */
  get _failedRows() {
    return this._rows.filter((r) => r.state === 'error');
  }

  _primaryLabel() {
    if (!this._postRun) return this._goLabel();
    if (this._runHasFailures) return 'Try again';
    return 'Done';
  }

  _onPrimaryAction() {
    if (!this._postRun) {
      this._onGo();
      return;
    }
    if (this._runHasFailures) {
      this._onTryAgain();
      return;
    }
    this._overlayOpen = false;
  }

  _onTryAgain() {
    this._postRun = false;
    this._runHasFailures = false;
    this._pendingSettleDetail = null;
    this._rows = this.files.map((path) => ({ path, state: 'pending', message: '' }));
    this.requestUpdate();
    this._onGo();
  }

  /**
   * Patch the row for `path` using current `_rows` so concurrent `_runOne` calls
   * do not overwrite each other (stale snapshot after await was the bug).
   * @param {(row: { path: string, state: string, message: string }) =>
   *   { path: string, state: string, message: string }} fn
   * @returns {boolean}
   */
  _patchRow(path, fn) {
    const idx = this._rows.findIndex((r) => r.path === path);
    if (idx < 0) return false;
    this._rows = this._rows.map((r, i) => (i === idx ? fn(r) : r));
    return true;
  }

  async _runOne(path) {
    if (!this._patchRow(path, (r) => ({ ...r, state: 'running', message: '' }))) return;

    const fullPath = path.startsWith('/') ? path : `/${path}`;

    if (this.mode === 'preview') {
      const res = await aemRequest(fullPath, 'preview', 'POST');
      this._patchRow(path, (r) => ({
        ...r,
        state: res.ok ? 'ok' : 'error',
        message: res.ok ? 'OK' : (res.message || 'Failed'),
      }));
      return;
    }

    if (this.mode === 'publish') {
      const p1 = await aemRequest(fullPath, 'preview', 'POST');
      if (!p1.ok) {
        this._patchRow(path, (r) => ({
          ...r,
          state: 'error',
          message: p1.message || 'Preview failed',
        }));
        return;
      }
      const p2 = await aemRequest(fullPath, 'live', 'POST');
      this._patchRow(path, (r) => ({
        ...r,
        state: p2.ok ? 'ok' : 'error',
        message: p2.ok ? 'OK' : (p2.message || 'Publish failed'),
      }));
      return;
    }

    const d = await aemRequest(fullPath, 'live', 'DELETE');
    this._patchRow(path, (r) => ({
      ...r,
      state: d.ok ? 'ok' : 'error',
      message: d.ok ? 'OK' : (d.message || 'Failed'),
    }));
  }

  async _onGo() {
    if (this._running || this.files.length === 0) return;
    this._running = true;
    this._postRun = false;
    this._runHasFailures = false;
    const paths = [...this.files];
    const callback = async (path) => {
      await this._runOne(path);
    };
    const queue = new Queue(callback, 5, null, 150);
    await Promise.all(paths.map((p) => queue.push(p)));
    this._running = false;
    const results = this._rows.map((row) => ({
      path: row.path,
      ok: row.state === 'ok',
      status: row.state,
      message: row.message,
    }));
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    this._postRun = true;
    this._runHasFailures = failCount > 0;
    this._pendingSettleDetail = {
      kind: 'completed',
      cancelled: false,
      okCount,
      failCount,
      results,
      message: failCount > 0
        ? `Bulk ${this.mode}: ${okCount} succeeded, ${failCount} failed.`
        : `Bulk ${this.mode}: completed ${okCount} page(s).`,
    };
    this.requestUpdate();
  }

  _statusClass(row) {
    if (row.state === 'ok') return 'bulk-aem-modal-status bulk-aem-modal-status-ok';
    if (row.state === 'error') return 'bulk-aem-modal-status bulk-aem-modal-status-error';
    return 'bulk-aem-modal-status bulk-aem-modal-status-pending';
  }

  _statusText(row) {
    if (row.state === 'pending') return '—';
    if (row.state === 'running') return '…';
    return row.message || (row.state === 'ok' ? 'OK' : 'Error');
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  render() {
    const count = this.files.length;
    const failed = this._failedRows;
    const showErrorPanel = this._postRun && this._runHasFailures && failed.length > 0;
    const primaryVariant = this._postRun && !this._runHasFailures
      ? 'accent'
      : this._goVariant();
    return html`
      <div class="bulk-aem-modal-host">
        <overlay-trigger
          type="modal"
          triggered-by="click"
          .open="${this._overlayOpen ? 'click' : undefined}"
          @sp-closed="${this._onOverlayClosed}"
        >
          <sp-dialog-wrapper
            slot="click-content"
            headline="${this._headlineForMode()}"
            dismissable
            underlay
          >
            <div class="bulk-aem-modal-body">
              <p class="bulk-aem-modal-summary">
                ${count === 0
    ? 'No files selected.'
    : `${count} file${count === 1 ? '' : 's'} — ${this.mode}`}
              </p>
              ${showErrorPanel ? html`
                <div class="bulk-aem-modal-error-panel" role="alert">
                  <div class="bulk-aem-modal-error-panel-title">Some operations failed</div>
                  <p class="bulk-aem-modal-error-panel-lead">
                    ${failed.length} of ${count}
                    ${count === 1 ? 'page could not be processed' : 'pages could not be processed'}.
                    You can try again or cancel to continue.
                  </p>
                  <ul class="bulk-aem-modal-error-panel-list">
                    ${failed.map((row) => html`
                      <li class="bulk-aem-modal-error-panel-item">
                        <span class="bulk-aem-modal-error-panel-path">${row.path}</span>
                      </li>
                    `)}
                  </ul>
                </div>
              ` : nothing}
              ${count > 0 && !showErrorPanel ? html`
                <ul class="bulk-aem-modal-list" aria-label="Files">
                  ${this._rows.map((row) => html`
                    <li class="bulk-aem-modal-row ${row.state === 'error' ? 'bulk-aem-modal-row-error' : ''}">
                      <span class="bulk-aem-modal-path">${row.path}</span>
                      <span class="${this._statusClass(row)}">${this._statusText(row)}</span>
                    </li>
                  `)}
                </ul>
              ` : nothing}
              <div class="bulk-aem-modal-actions">
                <sp-button
                  variant="secondary"
                  ?disabled="${this._running}"
                  @click="${() => { this._overlayOpen = false; }}"
                >Cancel</sp-button>
                <sp-button
                  variant="${primaryVariant}"
                  ?disabled="${this._running || count === 0}"
                  @click="${this._onPrimaryAction}"
                >${this._primaryLabel()}</sp-button>
              </div>
            </div>
          </sp-dialog-wrapper>
          <button
            type="button"
            slot="trigger"
            class="bulk-aem-modal-trigger-hidden"
            tabindex="-1"
            aria-hidden="true"
          ></button>
        </overlay-trigger>
      </div>
    `;
  }
}

customElements.define('da-bulk-aem-modal', DaBulkAemModal);
