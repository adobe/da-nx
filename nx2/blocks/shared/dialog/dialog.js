import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

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
    cancelLabel: { type: String, attribute: false },
    /** When **`VARIANT_DESTRUCTIVE`**, primary uses danger styling. */
    variant: { type: String, attribute: false },
    autofocusId: { type: String, attribute: false },
    dismissable: { type: Boolean, attribute: false },
    onPrimaryAction: { type: Function, attribute: false },
    onCancel: { type: Function, attribute: false },
  };

  _dismissable() {
    return this.dismissable !== false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._onDocKeydown = (e) => {
      if (e.key !== 'Escape') return;
      if (!this._dismissable()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this._onLayerClose();
    };
    document.addEventListener('keydown', this._onDocKeydown, true);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._onDocKeydown, true);
    super.disconnectedCallback();
  }

  firstUpdated() {
    super.firstUpdated();
    this._tryAutofocus();
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

  _onBackdropClick = (e) => {
    if (e.target !== e.currentTarget || !this._dismissable()) return;
    this._onLayerClose();
  };

  _onDialogPanelClick = (e) => {
    e.stopPropagation();
  };

  _isAlertByProps() {
    return (
      typeof this.title === 'string'
      && this.body != null
      && typeof this.primaryActionLabel === 'string'
      && typeof this.onPrimaryAction === 'function'
    );
  }

  _primaryButtonClass() {
    return this.variant === VARIANT_DESTRUCTIVE ? 'btn-danger' : 'btn-primary';
  }

  _alertActionsFromProps() {
    if (!this._isAlertByProps()) return nothing;
    const {
      cancelLabel,
      onCancel,
      onPrimaryAction,
      primaryActionId,
      primaryActionDisabled,
    } = this;
    const primaryClass = this._primaryButtonClass();
    return html`
      ${typeof cancelLabel === 'string' && onCancel
        ? html`
            <button
              type="button"
              class="btn btn-secondary"
              @click=${onCancel}
            >${cancelLabel}</button>
          `
        : nothing}
      <button
        type="button"
        class="btn ${primaryClass}"
        id=${primaryActionId || nothing}
        ?disabled=${Boolean(primaryActionDisabled)}
        @click=${onPrimaryAction}
      >${this.primaryActionLabel}</button>
    `;
  }

  _renderShell({ title, body, actions }) {
    return html`
      <div
        class="scrim"
        @click=${this._onBackdropClick}
      >
        <div
          class="panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nx-dialog-title"
          @click=${this._onDialogPanelClick}
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
      </div>
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
