import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { loadHrefSvg } from '../../../utils/svg.js';

export const VARIANT_SUCCESS = 'success';
export const VARIANT_ERROR = 'error';
export const VARIANT_WARNING = 'warning';

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
    cta: { attribute: false },
    _closeIcon: { state: true },
  };

  duration = 6000;

  _timerId;

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this.style.pointerEvents = 'auto';
    if (this.duration !== null) {
      const ms = Math.max(6000, Number(this.duration) || 6000);
      this._timerId = window.setTimeout(this.dismiss, ms);
    }
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
    const isWarning = this.variant === VARIANT_WARNING;
    const variantClass = isError || isWarning ? this.variant : VARIANT_SUCCESS;
    const role = isError || isWarning ? 'alert' : 'status';
    return html`
      <div class="toast toast-${variantClass}" role=${role}>
        <p class="text">${text}</p>
        ${this.cta?.href ? html`<a class="cta" href=${this.cta.href}>${this.cta.text}</a>` : nothing}
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

export function showToast({ text, variant = VARIANT_SUCCESS, cta, timeout = 6000, maxWidth } = {}) {
  const messageText = text?.trim();
  if (!messageText) return;
  const toast = document.createElement('nx-toast');
  toast.message = messageText;
  toast.variant = [VARIANT_ERROR, VARIANT_WARNING].includes(variant) ? variant : VARIANT_SUCCESS;
  toast.cta = cta;
  toast.duration = timeout; // null = indefinite (no auto-dismiss)
  if (maxWidth) toast.style.setProperty('--nx-toast-max-width', maxWidth);
  ensureHost().append(toast);
}

if (!customElements.get('nx-toast')) customElements.define('nx-toast', NxToast);
