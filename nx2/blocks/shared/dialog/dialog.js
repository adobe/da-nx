import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import '../progress-circle/progress-circle.js';

const styles = await loadStyle(import.meta.url);

/** Primary button uses danger styling (browse delete). */
export const VARIANT_DESTRUCTIVE = 'destructive';

class NxDialog extends LitElement {
  static properties = {
    title: { type: String, attribute: false },
    body: { type: Object, attribute: false },
    primaryActionLabel: { type: String, attribute: false },
    primaryActionId: { type: String, attribute: false },
    primaryActionDisabled: { type: Boolean, attribute: false },
    primaryActionPending: { type: Boolean, attribute: false },
    cancelLabel: { type: String, attribute: false },
    cancelActionDisabled: { type: Boolean, attribute: false },
    variant: { type: String, attribute: false },
    autofocusId: { type: String, attribute: false },
    dismissable: { type: Boolean, attribute: false },
  };

  _dismissable() {
    return this.dismissable !== false && !this.primaryActionPending;
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
      const el = this.renderRoot?.getElementById(id);
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

  _onCancelAction = () => {
    if (this.primaryActionPending) return;
    this.dispatchEvent(new CustomEvent('nx-dialog-cancel', {
      bubbles: true,
      composed: true,
    }));
  };

  _onPrimaryAction = () => {
    if (this.primaryActionPending) return;
    this.dispatchEvent(new CustomEvent('nx-dialog-primary', {
      bubbles: true,
      composed: true,
    }));
  };

  _isAlertByProps() {
    return (
      typeof this.title === 'string'
      && this.body != null
      && typeof this.primaryActionLabel === 'string'
    );
  }

  _primaryButtonClass() {
    return this.variant === VARIANT_DESTRUCTIVE ? 'btn-danger' : 'btn-primary';
  }

  _alertActionsFromProps() {
    if (!this._isAlertByProps()) return nothing;
    const {
      cancelLabel,
      cancelActionDisabled,
      primaryActionId,
      primaryActionDisabled,
      primaryActionPending,
    } = this;
    const primaryClass = this._primaryButtonClass();
    const pending = Boolean(primaryActionPending);
    return html`
      ${typeof cancelLabel === 'string'
        ? html`
            <button
              type="button"
              class="btn btn-secondary"
              ?disabled=${Boolean(cancelActionDisabled || pending)}
              @click=${this._onCancelAction}
            >${cancelLabel}</button>
          `
        : nothing}
      <button
        type="button"
        class=${`btn ${primaryClass}${pending ? ' is-pending' : ''}`}
        id=${primaryActionId || nothing}
        ?disabled=${Boolean(primaryActionDisabled || pending)}
        aria-busy=${pending ? 'true' : 'false'}
        @click=${this._onPrimaryAction}
      >
        ${pending
        ? html`<nx-progress-circle class="btn-progress" aria-hidden="true"></nx-progress-circle>`
        : nothing}
        <span class="btn-label">${this.primaryActionLabel}</span>
      </button>
    `;
  }

  _renderShell({ title, body, actions }) {
    const busy = Boolean(this.primaryActionPending);
    return html`
      <dialog
        class="shell"
        aria-labelledby="nx-dialog-title"
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
              <h2 class="title" id="nx-dialog-title">${title}</h2>
              <div
                class="title-divider"
                role="separator"
                aria-hidden="true"
              ></div>
            </div>
            <div class="body">
              ${body}
            </div>
          </div>
          <div class="actions">
            ${actions}
          </div>
        </div>
      </dialog>
    `;
  }

  render() {
    if (this._isAlertByProps()) {
      return this._renderShell({
        title: this.title,
        body: this.body,
        actions: this._alertActionsFromProps(),
      });
    }
    return nothing;
  }
}

customElements.define('nx-dialog', NxDialog);
