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
    _pending: { state: true, type: Boolean },
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

  _onInput = (e) => {
    const v = sanitizeName(e.target.value);
    e.target.value = v;
    this._draft = v;
  };

  _finalBasename() {
    return sanitizeName(this._draft ?? '', true);
  }

  _onKeydown = (e) => {
    if (e.key !== 'Enter' || this._pending || this._renamePrimaryDisabled()) return;
    e.preventDefault();
    this._onConfirm();
  };

  _renamePrimaryDisabled() {
    const row = this.selectedRow;
    if (!row) return true;
    return row.path === moveTarget(row, this._finalBasename());
  }

  _onDismiss = () => {
    this._emitComplete();
  };

  _onConfirm = async () => {
    const { selectedRow } = this;
    if (!selectedRow || this._pending) return;

    const destination = moveTarget(selectedRow, this._finalBasename());
    if (selectedRow.path === destination) {
      this._emitComplete();
      return;
    }

    this._pending = true;
    try {
      const r = await renameSourcePath(selectedRow.path, destination);
      if (r.ok) {
        this._emitComplete({ success: true });
      } else {
        this._emitComplete({
          message: {
            title: 'Rename failed',
            body: r.error || 'Rename failed',
            isError: true,
          },
        });
      }
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

  render() {
    const { selectedRow } = this;
    if (!selectedRow) return nothing;

    const draft = this._draft ?? '';
    const body = html`
      <div>
        <label class="field">
          <span class="field-caption">New name</span>
          <input
            id="browse-rename-input"
            class="text-input"
            type="text"
            autocomplete="off"
            .value=${draft}
            @input=${this._onInput}
            @keydown=${this._onKeydown}
          />
        </label>
      </div>
    `;

    return html`
      <nx-dialog
        .title=${'Rename'}
        .body=${body}
        .cancelLabel=${'Cancel'}
        .primaryActionLabel=${'Rename'}
        .cancelActionDisabled=${this._pending}
        .primaryActionDisabled=${this._renamePrimaryDisabled()}
        .primaryActionPending=${this._pending}
        .autofocusId=${'browse-rename-input'}
        .dismissable=${!this._pending}
        @nx-dialog-cancel=${this._onDismiss}
        @nx-dialog-primary=${this._onConfirm}
        @nx-dialog-close=${this._onDismiss}
      ></nx-dialog>
    `;
  }
}

customElements.define('nx-browse-rename-dialog', NxBrowseRenameDialog);
