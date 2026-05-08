import { LitElement, html, nothing } from 'da-lit';
import './reorder-dialog.js';

const EL_NAME = 'da-sc-array-item-menu';

class StructuredContentArrayItemMenu extends LitElement {
  static properties = {
    pointer: { attribute: false },
    index: { attribute: false },
    pointers: { attribute: false },
    readonly: { attribute: false },
    itemCount: { attribute: false },
    minItems: { attribute: false },
    maxItems: { attribute: false },
    _removeConfirm: { state: true },
    _reorderActive: { state: true },
    _targetIndex: { state: true },
  };

  constructor() {
    super();
    this._removeConfirm = false;
    this._removeConfirmTimer = null;
    this._reorderActive = false;
    this._targetIndex = 0;
  }

  createRenderRoot() {
    return this;
  }

  disconnectedCallback() {
    this._clearRemoveConfirmTimer();
    super.disconnectedCallback();
  }

  _getItemCount() {
    return this.itemCount ?? (this.pointers?.length ?? 0);
  }

  _getCurrentIndex() {
    return this.index ?? 0;
  }

  _getLastIndex() {
    return Math.max(0, this._getItemCount() - 1);
  }

  _canInsert() {
    if (this.readonly) return false;
    const itemCount = this._getItemCount();
    return this.maxItems === undefined || itemCount < this.maxItems;
  }

  _canReorder() {
    if (this.readonly) return false;
    return this._getItemCount() > 1;
  }

  _canRemove() {
    if (this.readonly) return false;
    const minItems = this.minItems ?? 0;
    const itemCount = this._getItemCount();
    return itemCount > minItems;
  }

  _clearRemoveConfirmTimer() {
    if (!this._removeConfirmTimer) return;
    clearTimeout(this._removeConfirmTimer);
    this._removeConfirmTimer = null;
  }

  _resetRemoveConfirm() {
    this._clearRemoveConfirmTimer();
    this._removeConfirm = false;
  }

  _armRemoveConfirm() {
    this._clearRemoveConfirmTimer();
    this._removeConfirm = true;
    this._removeConfirmTimer = setTimeout(() => {
      this._removeConfirm = false;
      this._removeConfirmTimer = null;
    }, 3000);
  }

  _resetReorder() {
    this._reorderActive = false;
    this._targetIndex = this._getCurrentIndex();
  }

  _setTargetIndex(index) {
    const clamped = Math.max(0, Math.min(index, this._getLastIndex()));
    this._targetIndex = clamped;
  }

  _openReorder() {
    if (!this._canReorder()) return;
    this._resetRemoveConfirm();
    this._reorderActive = true;
    this._setTargetIndex(this._getCurrentIndex());
  }

  _cancelReorder() {
    this._resetReorder();
  }

  _beforePointerFromTargetIndex(targetIndex) {
    const pointers = this.pointers ?? [];
    if (!pointers.length) return undefined;

    const currentIndex = this._getCurrentIndex();
    const lastIndex = pointers.length - 1;

    if (targetIndex > currentIndex) {
      if (targetIndex >= lastIndex) return undefined;
      return pointers[targetIndex + 1];
    }

    return pointers[targetIndex];
  }

  _confirmReorder() {
    if (!this._reorderActive) return;

    const currentIndex = this._getCurrentIndex();
    const targetIndex = this._targetIndex;

    if (targetIndex === currentIndex) {
      this._resetReorder();
      return;
    }

    const beforePointer = this._beforePointerFromTargetIndex(targetIndex);
    this._emit({
      type: 'form-array-reorder',
      pointer: this.pointer,
      beforePointer,
    });
    this._resetReorder();
  }

  _emit(detail) {
    this.dispatchEvent(new CustomEvent('form-intent', {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  _insertBefore() {
    if (!this._canInsert()) return;
    this._resetRemoveConfirm();
    this._resetReorder();
    this._emit({
      type: 'form-array-insert',
      pointer: this.pointer,
    });
  }

  _remove() {
    this._resetReorder();
    if (!this._canRemove()) return;

    if (!this._removeConfirm) {
      this._armRemoveConfirm();
      return;
    }

    this._resetRemoveConfirm();
    this._emit({
      type: 'form-array-remove',
      pointer: this.pointer,
    });
  }

  updated(changed) {
    const isConstraintChange = (
      changed.has('itemCount')
      || changed.has('minItems')
      || changed.has('readonly')
      || changed.has('pointers')
      || changed.has('index')
    );
    if (!isConstraintChange) return;

    if (!this._canRemove()) {
      this._resetRemoveConfirm();
    }

    if (!this._canReorder()) {
      this._resetReorder();
      return;
    }

    const lastIndex = this._getLastIndex();
    if (this._targetIndex > lastIndex) {
      this._targetIndex = lastIndex;
    }

    if (changed.has('index') && this._reorderActive) {
      this._setTargetIndex(this._getCurrentIndex());
    }
  }

  render() {
    const canInsert = this._canInsert();
    const canReorder = this._canReorder();
    const canRemove = this._canRemove();
    const removeLabel = this._removeConfirm && canRemove ? 'Confirm remove' : 'Remove';
    return html`
      <div>
        <button type="button" ?disabled=${!canInsert} @click=${this._insertBefore}>Insert</button>
        <button type="button" ?disabled=${!canReorder || this._reorderActive} @click=${this._openReorder}>Reorder</button>
        <button type="button" ?disabled=${!canRemove} @click=${this._remove}>${removeLabel}</button>
        ${this._reorderActive ? html`
          <da-sc-reorder-dialog
            .targetIndex=${this._targetIndex}
            .totalItems=${this._getItemCount()}
            @reorder-move-up=${() => this._setTargetIndex(this._targetIndex - 1)}
            @reorder-move-down=${() => this._setTargetIndex(this._targetIndex + 1)}
            @reorder-move-to-first=${() => this._setTargetIndex(0)}
            @reorder-move-to-last=${() => this._setTargetIndex(this._getLastIndex())}
            @reorder-confirm=${this._confirmReorder}
            @reorder-cancel=${this._cancelReorder}
          ></da-sc-reorder-dialog>
        ` : nothing}
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentArrayItemMenu);
}
