import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, DA_PREVIEW } from '../../utils/utils.js';
import { evaluatePage } from './api.js';
import { adaptEvaluation } from './adapter.js';

const styles = await loadStyle(import.meta.url);
const buttonStyles = await loadStyle(new URL('../../styles/buttons.css', import.meta.url).href);

await import('../chat-ao/artifacts/page-evaluation.js');

const REFRESH_ICON = '/img/icons/s2-icon-refresh-20-n.svg#icon';

function previewHref({ org, site, path }) {
  const { host } = new URL(DA_PREVIEW);
  const pathname = `/${String(path ?? '').replace(/^\/+/, '').replace(/\.html$/, '')}`;
  return `https://main--${site}--${org}.${host}${pathname}`;
}

class NxGovernancePreflight extends LitElement {
  static properties = {
    details: { attribute: false },
    _status: { state: true },
    _data: { state: true },
    _error: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttonStyles, styles];
    this._run();
  }

  async _run() {
    this._status = 'loading';
    const { org, site, path } = this.details ?? {};
    if (!org || !site || !path) {
      this._error = 'Missing page context.';
      this._status = 'error';
      return;
    }
    const { json, error } = await evaluatePage({ href: previewHref({ org, site, path }) });
    if (json) {
      this._data = adaptEvaluation(json);
      this._status = 'ready';
      return;
    }
    this._error = error || 'Could not evaluate this page.';
    this._status = 'error';
  }

  _renderToolbar() {
    return html`
      <div class="nx-gov-toolbar">
        <button
          type="button"
          class="nx-action-btn-icon nx-btn-sm"
          aria-label="Refresh evaluation"
          ?disabled=${this._status === 'loading'}
          @click=${this._run}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><use href=${REFRESH_ICON}></use></svg>
        </button>
      </div>
    `;
  }

  _renderBody() {
    if (this._status === 'loading') {
      return html`
        <div class="nx-gov-status">
          <span class="nx-loading-spinner" role="status" aria-label="Loading"></span>
          <span>Evaluating page…</span>
        </div>
      `;
    }
    if (this._status === 'error') {
      return html`
        <div class="nx-gov-status nx-gov-error">
          <p>${this._error}</p>
          <button type="button" class="nx-action-btn" @click=${this._run}>Try again</button>
        </div>
      `;
    }
    if (this._status === 'ready') {
      return html`<nx-page-eval .data=${this._data}></nx-page-eval>`;
    }
    return nothing;
  }

  render() {
    return html`
      ${this._renderToolbar()}
      ${this._renderBody()}
    `;
  }
}

if (!customElements.get('nx-governance-preflight')) {
  customElements.define('nx-governance-preflight', NxGovernancePreflight);
}

export default function render(details) {
  const el = document.createElement('nx-governance-preflight');
  el.details = details;
  return el;
}
