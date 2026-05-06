import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import '../progress-circle/progress-circle.js';

const styles = await loadStyle(import.meta.url);

class NxDialog extends LitElement {
  static properties = {
    title: { type: String, attribute: false },
    busy: { type: Boolean, attribute: false },
    autofocusId: { type: String, attribute: false },
    dismissable: { type: Boolean, attribute: false },
  };

  _dismissable() {
    return this.dismissable !== false && !this.busy;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  disconnectedCallback() {
    const dialog = this.renderRoot?.querySelector('.shell');
    if (dialog?.open) dialog.close();
    super.disconnectedCallback();
  }

  firstUpdated() {
    super.firstUpdated();
    this._ensureShown();
  }

  updated() {
    this._ensureShown();
  }

  _ensureShown() {
    const dialog = this.renderRoot?.querySelector('.shell');
    if (!dialog || dialog.open) return;
    try {
      dialog.showModal();
      this._tryAutofocus();
    } catch {
      // `showModal()` can fail if not connected yet; updated() retries.
    }
  }

  _tryAutofocus() {
    if (!this.autofocusId) return;
    const id = this.autofocusId;
    queueMicrotask(() => {
      const selector = typeof CSS !== 'undefined' && CSS.escape ? `#${CSS.escape(id)}` : `#${id}`;
      const el = this.querySelector(selector);
      if (!el) return;
      el.focus();
      if (el instanceof HTMLInputElement) {
        el.select();
      }
    });
  }

  _onLayerClose = () => {
    this.dispatchEvent(
      new CustomEvent('nx-dialog-close', { bubbles: true, composed: true }),
    );
  };

  _onNativeCancel = (e) => {
    e.preventDefault();
    if (!this._dismissable()) return;
    this._onLayerClose();
  };

  _onShellClick = (e) => {
    if (e.target !== e.currentTarget || !this._dismissable()) return;
    this._onLayerClose();
  };

  render() {
    const rawTitle = typeof this.title === 'string' ? this.title.trim() : '';
    const busy = Boolean(this.busy);
    return html`
      <dialog
        class="shell"
        aria-labelledby=${rawTitle ? 'nx-dialog-title' : nothing}
        aria-label=${rawTitle ? nothing : 'Dialog'}
        @cancel=${this._onNativeCancel}
        @click=${this._onShellClick}
      >
        <div
          class=${`panel${busy ? ' is-busy' : ''}`}
          aria-busy=${busy ? 'true' : 'false'}
          ?inert=${busy}
        >
          <div class="surface">
            <div class="heading">
              ${rawTitle
                ? html`
                    <h2 class="title" id="nx-dialog-title">${rawTitle}</h2>
                    <div
                      class="title-divider"
                      role="separator"
                      aria-hidden="true"
                    ></div>
                  `
                : nothing}
            </div>
            <div class="body"><slot></slot></div>
          </div>
          <div class="actions">
            <slot name="actions"></slot>
          </div>
        </div>
      </dialog>
    `;
  }
}

customElements.define('nx-dialog', NxDialog);
