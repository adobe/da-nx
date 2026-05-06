import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../utils/utils.js';
import { deleteSourcePath } from '../../browse-api.js';
import '../../../shared/dialog/dialog.js';

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
    _pending: { state: true, type: Boolean },
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

  _onCancel = () => {
    this._emitComplete();
  };

  _onConfirm = async () => {
    const { selectedRows } = this;
    if (!selectedRows?.length) {
      this._emitComplete();
      return;
    }
    this._pending = true;
    try {
      const result = await deleteItems({ selectedRows });
      if (result.ok) this._emitComplete({ success: true });
      else this._emitComplete({ message: result.message });
    } catch {
      this._emitComplete({
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
    this._emitComplete();
  };

  render() {
    const selectedRows = this.selectedRows ?? [];
    if (!selectedRows.length) return nothing;

    const n = selectedRows.length;
    const itemWord = n === 1 ? 'item' : 'items';
    const lines = selectedRows.map((r) => r.path).slice(0, 5);
    const more = n > 5 ? n - 5 : 0;
    return html`
      <nx-dialog
        .title=${`Delete ${n} ${itemWord}`}
        .busy=${this._pending}
        .dismissable=${!this._pending}
        @nx-dialog-close=${this._onClose}
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
          ?disabled=${this._pending}
          @click=${this._onCancel}
        >Cancel</button>
        <button
          slot="actions"
          type="button"
          class=${`btn btn-danger${this._pending ? ' is-pending' : ''}`}
          ?disabled=${this._pending}
          aria-busy=${this._pending ? 'true' : 'false'}
          @click=${this._onConfirm}
        >
          ${this._pending
            ? html`<nx-progress-circle class="btn-progress" aria-hidden="true"></nx-progress-circle>`
            : nothing}
          <span class="btn-label">Delete</span>
        </button>
      </nx-dialog>
    `;
  }
}

customElements.define('nx-browse-delete-dialog', NxBrowseDeleteDialog);
