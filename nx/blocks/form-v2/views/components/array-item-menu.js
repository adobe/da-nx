import { LitElement, html } from 'da-lit';

const EL_NAME = 'da-sc-array-item-menu';

class StructuredContentArrayItemMenu extends LitElement {
  static properties = {
    pointer: { attribute: false },
    index: { attribute: false },
    pointers: { attribute: false },
  };

  _emit(detail) {
    this.dispatchEvent(new CustomEvent('form-intent', {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  _moveUp() {
    if (this.index <= 0) return;
    this._emit({
      type: 'form-array-reorder',
      pointer: this.pointer,
      beforePointer: this.pointers[this.index - 1],
    });
  }

  _moveDown() {
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

  _insertBefore() {
    this._emit({
      type: 'form-array-insert',
      pointer: this.pointer,
    });
  }

  _remove() {
    this._emit({
      type: 'form-array-remove',
      pointer: this.pointer,
    });
  }

  render() {
    return html`
      <div>
        <button type="button" @click=${this._insertBefore}>Insert</button>
        <button type="button" @click=${this._moveUp}>Up</button>
        <button type="button" @click=${this._moveDown}>Down</button>
        <button type="button" @click=${this._remove}>Remove</button>
      </div>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentArrayItemMenu);
}
