import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../utils/utils.js';
import { deleteSourcePath } from '../../browse-api.js';
import { VARIANT_DESTRUCTIVE } from '../../../shared/dialog/dialog.js';
import '../../../shared/progress-circle/progress-circle.js';

async function deleteItems({ selectedRows }) {
  if (!selectedRows?.length) {
    return { ok: true };
  }
  for (const item of selectedRows) {
    const r = await deleteSourcePath(item.path);
    if (!r.ok) {
      return {
        ok: false,
        message: {
          title: 'Delete failed',
          body: r.error || 'Delete failed',
          isError: true,
        },
      };
    }
  }
  return { ok: true };
}

const styles = await loadStyle(import.meta.url);

class NxBrowseDeleteDialog extends LitElement {
  static properties = {
    selectedRows: { type: Array },
    onComplete: { type: Function, attribute: false },
    _pending: { state: true, type: Boolean },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _onCancel = () => {
    this.onComplete?.();
  };

  _onConfirm = async () => {
    const { selectedRows, onComplete } = this;
    if (!selectedRows?.length) {
      onComplete?.();
      return;
    }
    this._pending = true;
    try {
      const result = await deleteItems({ selectedRows });
      if (result.ok) onComplete?.({ success: true });
      else onComplete?.({ message: result.message });
    } catch {
      onComplete?.({
        message: {
          title: 'Something went wrong',
          body: 'An unexpected error occurred.',
          isError: true,
        },
      });
    } finally {
      this._pending = false;
    }
  };

  _onClose = () => {
    this.onComplete?.();
  };

  render() {
    const selectedRows = this.selectedRows ?? [];
    if (!selectedRows.length) return nothing;

    const n = selectedRows.length;
    const itemWord = n === 1 ? 'item' : 'items';
    const lines = selectedRows.map((r) => r.path).slice(0, 5);
    const more = n > 5 ? n - 5 : 0;
    const body = html`
      <div>
        <ul class="list">
          ${lines.map((path) => html`<li>${path}</li>`)}
        </ul>
        ${more > 0 ? html`<p class="hint">…and ${more} more</p>` : nothing}
      </div>
    `;

    return html`
      <div class="browse-action-root">
        <nx-dialog
          .title=${`Delete ${n} ${itemWord}`}
          .body=${body}
          .cancelLabel=${'Cancel'}
          .onCancel=${this._onCancel}
          .primaryActionLabel=${'Delete'}
          .onPrimaryAction=${this._onConfirm}
          .variant=${VARIANT_DESTRUCTIVE}
          .dismissable=${!this._pending}
          .primaryActionDisabled=${this._pending}
          @nx-dialog-close=${this._onClose}
        ></nx-dialog>
        ${this._pending
        ? html`
              <div class="browse-action-busy" aria-live="polite">
                <nx-progress-circle .label=${'Deleting'}></nx-progress-circle>
              </div>
            `
        : nothing}
      </div>
    `;
  }
}

customElements.define('nx-browse-delete-dialog', NxBrowseDeleteDialog);
