import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

export const VARIANT_SUCCESS = 'success';
export const VARIANT_ERROR = 'error';

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
  let hostElement = document.getElementById(HOST_ID);
  if (!hostElement) {
    hostElement = document.createElement('div');
    hostElement.id = HOST_ID;
    hostElement.setAttribute('role', 'region');
    hostElement.setAttribute('aria-label', 'Notifications');
    document.body.append(hostElement);
  }
  return hostElement;
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

  _isDismissed = false;

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this.style.pointerEvents = 'auto';
    const timeoutMs = Math.max(6000, Number(this.duration) || 6000);
    this._timerId = window.setTimeout(() => this.dismiss(), timeoutMs);
  }

  disconnectedCallback() {
    if (this._timerId !== undefined) {
      window.clearTimeout(this._timerId);
      this._timerId = undefined;
    }
    super.disconnectedCallback();
  }

  dismiss() {
    if (this._isDismissed) return;
    this._isDismissed = true;
    if (this._timerId !== undefined) {
      window.clearTimeout(this._timerId);
      this._timerId = undefined;
    }
    this.remove();
  }

  render() {
    const messageText = this.message?.trim();
    if (!messageText) return nothing;
    const isError = this.variant === VARIANT_ERROR;
    return html`
      <div
        class=${`toast toast-${isError ? VARIANT_ERROR : VARIANT_SUCCESS}`}
        role=${isError ? 'alert' : 'status'}
      >
        <p class="text">${messageText}</p>
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
  const messageText = text?.trim();
  if (!messageText || typeof document === 'undefined' || !document.body) return;
  const normalizedVariant = variant === VARIANT_ERROR ? VARIANT_ERROR : VARIANT_SUCCESS;
  const toastElement = document.createElement('nx-toast');
  toastElement.message = messageText;
  toastElement.variant = normalizedVariant;
  toastElement.duration = timeout;
  ensureHost().append(toastElement);
}

export function showToast({
  text,
  variant = VARIANT_SUCCESS,
  timeout = 6000,
} = {}) {
  appendNxToast({ text, variant, timeout });
}

customElements.define('nx-toast', NxToast);
