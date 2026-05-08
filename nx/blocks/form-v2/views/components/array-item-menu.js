import { LitElement, html } from 'da-lit';

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
  };

  constructor() {
    super();
    this._removeConfirm = false;
    this._removeConfirmTimer = null;
  }

  createRenderRoot() {
    return this;
  }

  disconnectedCallback() {
    this._clearRemoveConfirmTimer();
    super.disconnectedCallback();
  }

  _canRemove() {
    if (this.readonly) return false;
    const minItems = this.minItems ?? 0;
    const itemCount = this.itemCount ?? (this.pointers?.length ?? 0);
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

  _emit(detail) {
    this.dispatchEvent(new CustomEvent('form-intent', {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  _moveUp() {
    if (this.readonly) return;
    this._resetRemoveConfirm();
    if (this.index <= 0) return;
    this._emit({
      type: 'form-array-reorder',
      pointer: this.pointer,
      beforePointer: this.pointers[this.index - 1],
    });
  }

  _moveDown() {
    if (this.readonly) return;
    this._resetRemoveConfirm();
    const lastIndex = (this.pointers?.length ?? 1) - 1;
    if (this.index >= lastIndex) return;

    const beforePointer = this.index + 2 > lastIndex
      ? undefined
      : this.pointers[this.index + 2];

    this._emit({
      type: 'form-array-reorder',
      pointer: this.pointer,
      beforePointer,
    });
  }

  _moveFirst() {
    if (this.readonly) return;
    this._resetRemoveConfirm();
    if (this.index <= 0) return;
    this._emit({
      type: 'form-array-reorder',
      pointer: this.pointer,
      beforePointer: this.pointers[0],
    });
  }

  _moveLast() {
    if (this.readonly) return;
    this._resetRemoveConfirm();
    const lastIndex = (this.pointers?.length ?? 1) - 1;
    if (this.index >= lastIndex) return;
    this._emit({
      type: 'form-array-reorder',
      pointer: this.pointer,
      beforePointer: undefined,
    });
  }

  _insertBefore() {
    if (this.readonly) return;
    this._resetRemoveConfirm();
    const itemCount = this.itemCount ?? (this.pointers?.length ?? 0);
    if (this.maxItems !== undefined && itemCount >= this.maxItems) return;
    this._emit({
      type: 'form-array-insert',
      pointer: this.pointer,
    });
  }

  _remove() {
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
    if (
      !changed.has('itemCount')
      && !changed.has('minItems')
      && !changed.has('readonly')
      && !changed.has('pointers')
    ) return;

    if (!this._canRemove()) {
      this._resetRemoveConfirm();
    }
  }

  render() {
    const readonly = !!this.readonly;
    const { maxItems } = this;
    const itemCount = this.itemCount ?? (this.pointers?.length ?? 0);
    const canInsert = !readonly && (maxItems === undefined || itemCount < maxItems);
    const canRemove = this._canRemove();
    const removeLabel = this._removeConfirm && canRemove ? 'Confirm remove' : 'Remove';
    const canMoveUp = this.index > 0;
    const canMoveDown = this.index < ((this.pointers?.length ?? 1) - 1);
    return html`
      <div>
        <button type="button" ?disabled=${!canInsert} @click=${this._insertBefore}>Insert</button>
        <button type="button" ?disabled=${readonly || !canMoveUp} @click=${this._moveFirst}>First</button>
        <button type="button" ?disabled=${readonly || !canMoveUp} @click=${this._moveUp}>Up</button>
        <button type="button" ?disabled=${readonly || !canMoveDown} @click=${this._moveDown}>Down</button>
        <button type="button" ?disabled=${readonly || !canMoveDown} @click=${this._moveLast}>Last</button>
        <button type="button" ?disabled=${!canRemove} @click=${this._remove}>${removeLabel}</button>
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentArrayItemMenu);
}
