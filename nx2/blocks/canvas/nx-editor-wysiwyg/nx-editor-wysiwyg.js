import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { getPreviewOrigin, fetchWysiwygCookie } from './utils/preview.js';
import { loadIms } from '../../../utils/ims.js';

const style = await loadStyle(import.meta.url);

const QUICK_EDIT_INIT_INTERVAL_MS = 400;
const QUICK_EDIT_INIT_MAX_ATTEMPTS = 25;

const WYSIWYG_PORT_READY_ATTR = 'data-nx-wysiwyg-port-ready';

function buildQuickEditInitPayload({ org, repo, path }) {
  const pathWithoutOrgRepo = path.split('/').slice(2).join('/').replace(/\.html$/i, '');
  const pathname = pathWithoutOrgRepo ? `/${pathWithoutOrgRepo}` : '/';
  return {
    config: {
      mountpoint: `${getPreviewOrigin(org, repo)}/${org}/${repo}`,
    },
    location: { pathname },
  };
}

function postQuickEditInitToIframe({ iframe, config, location, onReady }) {
  const { port1, port2 } = new MessageChannel();
  port1.onmessage = (ev) => {
    if (ev.data?.ready !== true) return;
    onReady(port1);
  };
  try {
    const targetOrigin = new URL(iframe.src).origin;
    iframe.contentWindow.postMessage({ init: config, location }, targetOrigin, [port2]);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[nx-editor-wysiwyg] Error posting init to iframe', err);
  }
}

async function tryLoadWysiwygPreviewCookies({ org, repo, path, getCurrentCtx }) {
  try {
    const token = (await loadIms())?.accessToken?.token;
    if (!token) {
      // eslint-disable-next-line no-console
      console.error('[nx-editor-wysiwyg] Preview cookies: no auth token (sign in required)');
      return false;
    }
    await fetchWysiwygCookie({ org, repo, token });
    const cur = getCurrentCtx();
    if (cur?.org !== org || cur?.repo !== repo || cur?.path !== path) {
      return false;
    }
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[nx-editor-wysiwyg] Preview cookies failed', e);
    return false;
  }
}

export class NxEditorWysiwyg extends LitElement {
  static properties = {
    ctx: { type: Object },
    _cookieReady: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  disconnectedCallback() {
    this._clearQuickEditRetry();
    super.disconnectedCallback();
  }

  get _iframeSrc() {
    const { org, repo, path } = this.ctx ?? {};
    if (!org || !repo || !path || !this._cookieReady) return null;
    const segments = path.split('/');
    const pathWithoutOrgRepo = segments.slice(2).join('/');
    const pathWithoutHtml = pathWithoutOrgRepo.replace(/\.html$/i, '');
    const encodedPath = pathWithoutHtml.split('/').map(encodeURIComponent).join('/');
    const base = `${getPreviewOrigin(org, repo)}/${encodedPath}?nx=exp-workspace&quick-edit=exp-workspace`;
    return `${base}&controller=parent`;
  }

  _clearQuickEditRetry() {
    if (this._quickEditInitRetryId) {
      clearInterval(this._quickEditInitRetryId);
      this._quickEditInitRetryId = null;
    }
  }

  _resetCookieStateForCtxChange() {
    this._clearQuickEditRetry();
    this._cookieReady = false;
  }

  updated(changed) {
    super.updated(changed);
    if (!changed.has('ctx')) return;
    this.removeAttribute(WYSIWYG_PORT_READY_ATTR);
    this._resetCookieStateForCtxChange();
    const { org, repo, path } = this.ctx ?? {};
    if (!org || !repo || !path) return;

    tryLoadWysiwygPreviewCookies({
      org,
      repo,
      path,
      getCurrentCtx: () => this.ctx,
    }).then((ok) => {
      if (!ok) return;
      this._cookieReady = true;
      this.requestUpdate();
    });
  }

  _dispatchWysiwygPortReady(port) {
    this._clearQuickEditRetry();
    this.setAttribute(WYSIWYG_PORT_READY_ATTR, '');
    this.dispatchEvent(new CustomEvent('nx-wysiwyg-port-ready', {
      bubbles: true,
      composed: true,
      detail: { port },
    }));
  }

  _scheduleQuickEditInitRetries(send) {
    let attempts = 0;
    this._quickEditInitRetryId = setInterval(() => {
      attempts += 1;
      if (attempts >= QUICK_EDIT_INIT_MAX_ATTEMPTS) {
        this._clearQuickEditRetry();
        return;
      }
      send();
    }, QUICK_EDIT_INIT_INTERVAL_MS);
  }

  _onIframeLoad(e) {
    const iframe = e?.target;
    const { org, repo, path } = this.ctx ?? {};
    if (!iframe?.contentWindow || !org || !repo || !path) return;

    this.removeAttribute(WYSIWYG_PORT_READY_ATTR);
    this._clearQuickEditRetry();

    const { config, location } = buildQuickEditInitPayload({ org, repo, path });
    const send = () => postQuickEditInitToIframe({
      iframe,
      config,
      location,
      onReady: (port) => this._dispatchWysiwygPortReady(port),
    });

    send();
    this._scheduleQuickEditInitRetries(send);
  }

  render() {
    const { org, repo, path } = this.ctx ?? {};
    const hasPath = org && repo && path;
    if (!hasPath) {
      return html`
        <div class="nx-editor-wysiwyg-placeholder">Select an HTML file for WYSIWYG preview.</div>
      `;
    }
    if (!this._cookieReady) {
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
