import { LitElement, html } from 'da-lit';

const EL_NAME = 'da-sc-array-item-menu';

class StructuredContentArrayItemMenu extends LitElement {
  static properties = {
    pointer: { attribute: false },
    index: { attribute: false },
    pointers: { attribute: false },
    readonly: { attribute: false },
  };

  _emit(detail) {
    this.dispatchEvent(new CustomEvent('form-intent', {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  _moveUp() {
    if (this.readonly) return;
    if (this.index <= 0) return;
    this._emit({
      type: 'form-array-reorder',
      pointer: this.pointer,
      beforePointer: this.pointers[this.index - 1],
    });
  }

  _moveDown() {
    if (this.readonly) return;
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
    if (this.index <= 0) return;
    this._emit({
      type: 'form-array-reorder',
      pointer: this.pointer,
      beforePointer: this.pointers[0],
    });
  }

  _moveLast() {
    if (this.readonly) return;
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
    this._emit({
      type: 'form-array-insert',
      pointer: this.pointer,
    });
  }

  _remove() {
    if (this.readonly) return;
    this._emit({
      type: 'form-array-remove',
      pointer: this.pointer,
    });
  }

  render() {
    const readonly = !!this.readonly;
    const canMoveUp = this.index > 0;
    const canMoveDown = this.index < ((this.pointers?.length ?? 1) - 1);
    return html`
      <div>
        <button type="button" ?disabled=${readonly} @click=${this._insertBefore}>Insert</button>
        <button type="button" ?disabled=${readonly || !canMoveUp} @click=${this._moveFirst}>First</button>
        <button type="button" ?disabled=${readonly || !canMoveUp} @click=${this._moveUp}>Up</button>
        <button type="button" ?disabled=${readonly || !canMoveDown} @click=${this._moveDown}>Down</button>
        <button type="button" ?disabled=${readonly || !canMoveDown} @click=${this._moveLast}>Last</button>
        <button type="button" ?disabled=${readonly} @click=${this._remove}>Remove</button>
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentArrayItemMenu);
}
