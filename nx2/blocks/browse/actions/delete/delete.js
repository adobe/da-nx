import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../utils/utils.js';
import { deleteSourcePath } from '../../browse-api.js';
import '../../../shared/dialog/dialog.js';

async function deleteItems({ selectedRows }) {
  if (!selectedRows?.length) {
    return { ok: true };
  }
  for (const item of selectedRows) {
    const deleteResult = await deleteSourcePath(item.path);
    if (!deleteResult.ok) {
      return {
        ok: false,
        message: deleteResult.error || 'Delete failed',
      };
    }
  }
  return { ok: true };
}

const styles = await loadStyle(import.meta.url);

class NxBrowseDeleteDialog extends LitElement {
  static properties = {
    selectedRows: { type: Array },
    _isPending: { state: true, type: Boolean },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  _emitComplete(detail = {}) {
    this.dispatchEvent(new CustomEvent('nx-browse-action-complete', {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  _handleCancel = () => {
    this._emitComplete();
  };

  _handleConfirm = async () => {
    const { selectedRows } = this;
    if (!selectedRows?.length) {
      this._emitComplete();
      return;
    }
    this._isPending = true;
    try {
      const result = await deleteItems({ selectedRows });
      if (result.ok) this._emitComplete({ success: true });
      else this._emitComplete({ message: result.message });
    } catch {
      this._emitComplete({
        message: 'An unexpected error occurred.',
      });
    } finally {
      this._isPending = false;
    }
  };

  _handleClose = () => {
    this._emitComplete();
  };

  render() {
    const selectedRows = this.selectedRows ?? [];
    if (!selectedRows.length) return nothing;

    const selectedCount = selectedRows.length;
    const itemWord = selectedCount === 1 ? 'item' : 'items';
    const lines = selectedRows.map((selectedRow) => selectedRow.path).slice(0, 5);
    const more = selectedCount > 5 ? selectedCount - 5 : 0;
    return html`
      <nx-dialog
        .title=${`Delete ${selectedCount} ${itemWord}`}
        .busy=${this._isPending}
        .dismissable=${!this._isPending}
        @nx-dialog-close=${this._handleClose}
      >
        <div>
          <ul class="list">
            ${lines.map((path) => html`<li>${path}</li>`)}
          </ul>
          ${more > 0 ? html`<p class="hint">…and ${more} more</p>` : nothing}
        </div>
        <button
          slot="actions"
          type="button"
          class="btn btn-secondary"
          ?disabled=${this._isPending}
          @click=${this._handleCancel}
        >Cancel</button>
        <button
          slot="actions"
          type="button"
          class=${`btn btn-danger${this._isPending ? ' is-pending' : ''}`}
          ?disabled=${this._isPending}
          aria-busy=${this._isPending ? 'true' : 'false'}
          @click=${this._handleConfirm}
        >
          ${this._isPending
        ? html`<nx-progress-circle aria-hidden="true"></nx-progress-circle>`
        : nothing}
          <span>Delete</span>
        </button>
      </nx-dialog>
    `;
  }
}

customElements.define('nx-browse-delete-dialog', NxBrowseDeleteDialog);
