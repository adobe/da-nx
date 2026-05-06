import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

export const VARIANT_SUCCESS = 'success';
export const VARIANT_ERROR = 'error';
export const NX_TOAST_SHOW_EVENT = 'nx-toast-show';

const styles = await loadStyle(import.meta.url);
const hostSheet = await loadStyle(new URL('toast-host.css', import.meta.url).href);
const HOST_ID = 'nx-toast-host';

function ensureHost() {
  if (
    document.adoptedStyleSheets
    && !document.adoptedStyleSheets.includes(hostSheet)
  ) {
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, hostSheet];
  }
  let el = document.getElementById(HOST_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = HOST_ID;
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Notifications');
    document.body.append(el);
  }
  return el;
}

/**
 * Simple toast: **`message`**, **`variant`**
 * (**`VARIANT_SUCCESS`** \| **`VARIANT_ERROR`**), **`duration`** (ms, min 6000).
 */
class NxToast extends LitElement {
  static properties = {
    message: { type: String },
    variant: { type: String },
    duration: { type: Number },
  };

  _timerId = undefined;

  _dismissed = false;

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this.style.pointerEvents = 'auto';
    const ms = Math.max(6000, Number(this.duration) || 6000);
    this._timerId = window.setTimeout(() => this.dismiss(), ms);
  }

  disconnectedCallback() {
    if (this._timerId !== undefined) {
      window.clearTimeout(this._timerId);
      this._timerId = undefined;
    }
    super.disconnectedCallback();
  }

  dismiss() {
    if (this._dismissed) return;
    this._dismissed = true;
    if (this._timerId !== undefined) {
      window.clearTimeout(this._timerId);
      this._timerId = undefined;
    }
    this.remove();
  }

  render() {
    const msg = this.message?.trim();
    if (!msg) return nothing;
    const err = this.variant === VARIANT_ERROR;
    return html`
      <div
        class=${`toast toast-${err ? VARIANT_ERROR : VARIANT_SUCCESS}`}
        role=${err ? 'alert' : 'status'}
      >
        <p class="text">${msg}</p>
        <button
          type="button"
          class="close"
          aria-label="Dismiss"
          @click=${() => this.dismiss()}
        >
          <span class="close-icon" aria-hidden="true"></span>
        </button>
      </div>
    `;
  }
}

function appendNxToast({
  text,
  variant = VARIANT_SUCCESS,
  timeout = 6000,
}) {
  const t = text?.trim();
  if (!t || typeof document === 'undefined' || !document.body) return;
  const v = variant === VARIANT_ERROR ? VARIANT_ERROR : VARIANT_SUCCESS;
  const el = document.createElement('nx-toast');
  el.message = t;
  el.variant = v;
  el.duration = timeout;
  ensureHost().append(el);
}

const onToastShow = (e) => {
  appendNxToast(e.detail || {});
};

function ensureToastBus() {
  if (typeof document === 'undefined') return;
  // Idempotent setup if this module is re-evaluated.
  document.removeEventListener(NX_TOAST_SHOW_EVENT, onToastShow);
  document.addEventListener(NX_TOAST_SHOW_EVENT, onToastShow);
}

ensureToastBus();

customElements.define('nx-toast', NxToast);
