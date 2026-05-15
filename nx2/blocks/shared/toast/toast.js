import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { loadHrefSvg } from '../../../utils/svg.js';

export const VARIANT_SUCCESS = 'success';
export const VARIANT_ERROR = 'error';

const CLOSE_ICON_URL = new URL('../../../img/icons/S2_Icon_Close_20_N.svg', import.meta.url).href;

const styles = await loadStyle(import.meta.url);
const hostSheet = await loadStyle(new URL('toast-host.css', import.meta.url).href);

let closeIconPromise;
const getCloseIcon = () => {
  closeIconPromise ??= loadHrefSvg(CLOSE_ICON_URL);
  return closeIconPromise;
};

const HOST_ID = 'nx-toast-host';

function ensureHost() {
  if (!document.adoptedStyleSheets.includes(hostSheet)) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, hostSheet];
  }
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', 'Notifications');
    document.body.append(host);
  }
  return host;
}

class NxToast extends LitElement {
  static properties = {
    message: { type: String, attribute: false },
    variant: { type: String, attribute: false },
    _closeIcon: { state: true },
  };

  duration = 6000;

  _timerId;

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this.style.pointerEvents = 'auto';
    const ms = Math.max(6000, Number(this.duration) || 6000);
    this._timerId = window.setTimeout(this.dismiss, ms);
    this._loadIcon();
  }

  async _loadIcon() {
    const icon = await getCloseIcon();
    if (!this.isConnected) return;
    this._closeIcon = icon;
  }

  disconnectedCallback() {
    window.clearTimeout(this._timerId);
    this._timerId = undefined;
    super.disconnectedCallback();
  }

  dismiss = () => {
    window.clearTimeout(this._timerId);
    this._timerId = undefined;
    this.remove();
  };

  render() {
    const text = this.message?.trim();
    if (!text) return nothing;
    const isError = this.variant === VARIANT_ERROR;
    return html`
      <div
        class="toast toast-${isError ? VARIANT_ERROR : VARIANT_SUCCESS}"
        role=${isError ? 'alert' : 'status'}
      >
        <p class="text">${text}</p>
        <button
          type="button"
          class="close"
          aria-label="Dismiss"
          @click=${this.dismiss}
        >${this._closeIcon?.cloneNode(true)}</button>
      </div>
    `;
  }
}

export function showToast({ text, variant = VARIANT_SUCCESS, timeout = 6000 } = {}) {
  const messageText = text?.trim();
  if (!messageText) return;
  const toast = document.createElement('nx-toast');
  toast.message = messageText;
  toast.variant = variant === VARIANT_ERROR ? VARIANT_ERROR : VARIANT_SUCCESS;
  toast.duration = timeout;
  ensureHost().append(toast);
}

customElements.define('nx-toast', NxToast);
