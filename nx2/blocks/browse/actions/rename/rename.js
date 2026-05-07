import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../utils/utils.js';
import { renameSourcePath } from '../../browse-api.js';
import { isFolder, sanitizeName } from '../../utils.js';
import '../../../shared/dialog/dialog.js';

const styles = await loadStyle(import.meta.url);

function moveTarget(item, newBaseName) {
  const name = newBaseName.trim();
  if (!name || name.includes('/') || !item?.path) return '';
  const slash = item.path.lastIndexOf('/');
  if (slash < 1) return '';
  const dir = item.path.slice(0, slash);
  if (isFolder(item)) return `${dir}/${name}`;
  const raw = item.ext?.trim();
  if (raw && !name.includes('.')) {
    const ext = raw.startsWith('.') ? raw.slice(1) : raw;
    return `${dir}/${name}.${ext}`;
  }
  return `${dir}/${name}`;
}

class NxBrowseRenameDialog extends LitElement {
  static properties = {
    selectedRow: { type: Object },
    _draft: { state: true },
    _isPending: { state: true, type: Boolean },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  willUpdate(changed) {
    if (changed.has('selectedRow') && this.selectedRow) {
      this._draft = sanitizeName(this.selectedRow.name.trim());
    }
  }

  _emitComplete(detail = {}) {
    this.dispatchEvent(new CustomEvent('nx-browse-action-complete', {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  _handleInput = (event) => {
    const sanitizedValue = sanitizeName(event.target.value);
    event.target.value = sanitizedValue;
    this._draft = sanitizedValue;
  };

  _finalBasename() {
    return sanitizeName(this._draft ?? '', true);
  }

  _handleKeydown = (event) => {
    if (event.key !== 'Enter' || this._isPending || this._isRenamePrimaryDisabled()) return;
    event.preventDefault();
    this._handleConfirm();
  };

  _isRenamePrimaryDisabled() {
    const { selectedRow } = this;
    if (!selectedRow) return true;
    return selectedRow.path === moveTarget(selectedRow, this._finalBasename());
  }

  _handleDismiss = () => {
    this._emitComplete();
  };

  _handleConfirm = async () => {
    const { selectedRow } = this;
    if (!selectedRow || this._isPending) return;

    const destination = moveTarget(selectedRow, this._finalBasename());
    if (selectedRow.path === destination) {
      this._emitComplete();
      return;
    }

    this._isPending = true;
    try {
      const renameResult = await renameSourcePath(selectedRow.path, destination);
      if (renameResult.ok) {
        this._emitComplete({ success: true });
      } else {
        this._emitComplete({
          message: renameResult.error || 'Rename failed',
        });
      }
    } catch {
      this._emitComplete({
        message: 'An unexpected error occurred.',
      });
    } finally {
      this._isPending = false;
    }
  };

  render() {
    const { selectedRow } = this;
    if (!selectedRow) return nothing;

    const draft = this._draft ?? '';
    return html`
      <nx-dialog
        .title=${'Rename'}
        .busy=${this._isPending}
        .autofocusId=${'browse-rename-input'}
        .dismissable=${!this._isPending}
        @nx-dialog-close=${this._handleDismiss}
      >
        <div>
          <label class="field">
            <span class="field-caption">New name</span>
            <input
              id="browse-rename-input"
              class="text-input"
              type="text"
              autocomplete="off"
              .value=${draft}
              @input=${this._handleInput}
              @keydown=${this._handleKeydown}
            />
          </label>
        </div>
        <button
          slot="actions"
          type="button"
          class="btn btn-secondary"
          ?disabled=${this._isPending}
          @click=${this._handleDismiss}
        >Cancel</button>
        <button
          slot="actions"
          type="button"
          class=${`btn btn-primary${this._isPending ? ' is-pending' : ''}`}
          ?disabled=${this._isRenamePrimaryDisabled() || this._isPending}
          aria-busy=${this._isPending ? 'true' : 'false'}
          @click=${this._handleConfirm}
        >
          ${this._isPending
        ? html`<nx-progress-circle aria-hidden="true"></nx-progress-circle>`
        : nothing}
          <span>Rename</span>
        </button>
      </nx-dialog>
    `;
  }
}

customElements.define('nx-browse-rename-dialog', NxBrowseRenameDialog);
