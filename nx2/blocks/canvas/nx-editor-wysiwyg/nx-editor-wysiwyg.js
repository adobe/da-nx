import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { getPreviewOrigin, fetchWysiwygCookie } from './utils/preview.js';

const style = await loadStyle(import.meta.url);

const QUICK_EDIT_INIT_INTERVAL_MS = 400;
const QUICK_EDIT_INIT_MAX_ATTEMPTS = 25;

export class NxEditorWysiwyg extends LitElement {
  static properties = {
    org: { type: String },
    repo: { type: String },
    path: { type: String },
    _cookieReady: { state: true },
    _cookieError: { state: true },
  };

  constructor() {
    super();
    this.org = '';
    this.repo = '';
    this.path = '';
    this._cookieReady = false;
    this._cookieError = null;
    /** @type {ReturnType<typeof setInterval> | null} */
    this._quickEditInitRetryId = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  disconnectedCallback() {
    this._clearQuickEditRetry();
    super.disconnectedCallback();
  }

  get _iframeSrc() {
    if (!this.org || !this.repo || !this.path || !this._cookieReady) return null;
    const segments = this.path.split('/');
    const pathWithoutOrgRepo = segments.slice(2).join('/');
    const pathWithoutHtml = pathWithoutOrgRepo.replace(/\.html$/i, '');
    const encodedPath = pathWithoutHtml.split('/').map(encodeURIComponent).join('/');
    const base = `${getPreviewOrigin(this.org, this.repo)}/${encodedPath}?nx=exp-workspace&quick-edit=exp-workspace`;
    return `${base}&controller=parent`;
  }

  _clearQuickEditRetry() {
    if (this._quickEditInitRetryId != null) {
      clearInterval(this._quickEditInitRetryId);
      this._quickEditInitRetryId = null;
    }
  }

  updated(changed) {
    super.updated(changed);
    if (changed.has('org') || changed.has('repo') || changed.has('path')) {
      this._clearQuickEditRetry();
      this._cookieReady = false;
      this._cookieError = null;
      if (!this.org || !this.repo || !this.path) {
        return;
      }
      const { org, repo } = this;
      (async () => {
        try {
          const { loadIms } = await import('../../../utils/ims.js');
          const token = (await loadIms())?.accessToken?.token;
          if (!token) {
            this._cookieError = 'Sign in required';
            this.requestUpdate();
            return;
          }
          await fetchWysiwygCookie({ org, repo, token });
          if (this.org !== org || this.repo !== repo) return;
          this._cookieReady = true;
          this._cookieError = null;
        } catch (e) {
          this._cookieError = e?.message ?? 'Failed to load preview cookies';
        }
        this.requestUpdate();
      })().catch(() => {});
    }
  }

  /**
   * @param {Event & { target: HTMLIFrameElement }} e
   */
  _onIframeLoad(e) {
    const iframe = e?.target;
    if (!iframe?.contentWindow || !this.org || !this.repo || !this.path) return;

    this._clearQuickEditRetry();

    const pathWithoutOrgRepo = this.path.split('/').slice(2).join('/').replace(/\.html$/i, '');
    const pathname = pathWithoutOrgRepo ? `/${pathWithoutOrgRepo}` : '/';

    const config = {
      mountpoint: `${getPreviewOrigin(this.org, this.repo)}/${this.org}/${this.repo}`,
    };
    const location = { pathname };

    const trySendInit = () => {
      const { port1, port2 } = new MessageChannel();

      port1.onmessage = (ev) => {
        if (ev.data?.ready !== true) return;
        this._clearQuickEditRetry();
        this.dispatchEvent(new CustomEvent('nx-wysiwyg-port-ready', {
          bubbles: true,
          composed: true,
          detail: { port: port1 },
        }));
      };

      try {
        const targetOrigin = new URL(iframe.src).origin;
        iframe.contentWindow.postMessage({ init: config, location }, targetOrigin, [port2]);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[nx-editor-wysiwyg] Error posting init to iframe', err);
      }
    };

    let attempts = 0;
    trySendInit();
    this._quickEditInitRetryId = setInterval(() => {
      attempts += 1;
      if (attempts >= QUICK_EDIT_INIT_MAX_ATTEMPTS) {
        this._clearQuickEditRetry();
        return;
      }
      trySendInit();
    }, QUICK_EDIT_INIT_INTERVAL_MS);
  }

  render() {
    const hasPath = this.org && this.repo && this.path;
    if (!hasPath) {
      return html`
        <div class="nx-editor-wysiwyg-placeholder">Select an HTML file for WYSIWYG preview.</div>
      `;
    }
    if (!this._cookieReady) {
      if (this._cookieError) {
        return html`
          <div class="nx-editor-wysiwyg-placeholder nx-editor-wysiwyg-error">${this._cookieError}</div>
        `;
      }
      return html`<div class="nx-editor-wysiwyg-placeholder">Loading preview…</div>`;
    }
    const src = this._iframeSrc;
    return html`
      <iframe
        title="WYSIWYG preview"
        src="${src}"
        allow="local-network-access"
        class="nx-editor-wysiwyg-iframe"
        @load=${this._onIframeLoad}
      ></iframe>
    `;
  }
}

customElements.define('nx-editor-wysiwyg', NxEditorWysiwyg);
