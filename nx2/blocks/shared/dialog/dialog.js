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

  _isDismissable() {
    return this.dismissable !== false && !this.busy;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  disconnectedCallback() {
    const dialogElement = this.renderRoot?.querySelector('.shell');
    if (dialogElement?.open) dialogElement.close();
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
    const dialogElement = this.renderRoot?.querySelector('.shell');
    if (!dialogElement || dialogElement.open) return;
    try {
      dialogElement.showModal();
      this._tryAutofocus();
    } catch {
      // `showModal()` can fail if not connected yet; updated() retries.
    }
  }

  _tryAutofocus() {
    if (!this.autofocusId) return;
    const { autofocusId } = this;
    queueMicrotask(() => {
      const selector = typeof CSS !== 'undefined' && CSS.escape
        ? `#${CSS.escape(autofocusId)}`
        : `#${autofocusId}`;
      const autofocusElement = this.querySelector(selector);
      if (!autofocusElement) return;
      autofocusElement.focus();
      if (autofocusElement instanceof HTMLInputElement) {
        autofocusElement.select();
      }
    });
  }

  _handleLayerClose = () => {
    this.dispatchEvent(
      new CustomEvent('nx-dialog-close', { bubbles: true, composed: true }),
    );
  };

  _handleNativeCancel = (event) => {
    event.preventDefault();
    if (!this._isDismissable()) return;
    this._handleLayerClose();
  };

  _handleShellClick = (event) => {
    if (event.target !== event.currentTarget || !this._isDismissable()) return;
    this._handleLayerClose();
  };

  render() {
    const rawTitle = typeof this.title === 'string' ? this.title.trim() : '';
    const isBusy = Boolean(this.busy);
    return html`
      <dialog
        class="shell"
        aria-labelledby=${rawTitle ? 'nx-dialog-title' : nothing}
        aria-label=${rawTitle ? nothing : 'Dialog'}
        @cancel=${this._handleNativeCancel}
        @click=${this._handleShellClick}
      >
        <div
          class=${`panel${isBusy ? ' is-busy' : ''}`}
          aria-busy=${isBusy ? 'true' : 'false'}
          ?inert=${isBusy}
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
