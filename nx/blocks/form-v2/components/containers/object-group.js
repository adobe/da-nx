import { LitElement, html, nothing } from 'da-lit';

const EL_NAME = 'da-sc-object-group';

class StructuredContentObjectGroup extends LitElement {
  static properties = {
    node: { attribute: false },
    errorsByPointer: { attribute: false },
  };

  render() {
    const { node } = this;
    if (!node) return nothing;

    const children = node.children ?? [];
    const required = node.required ? '*' : '';

    return html`
      <fieldset data-pointer=${node.pointer}>
        <legend @click=${this._selectSelf}>${node.label}${required}</legend>
        ${children.map((child) => html`
          <da-sc-field-section
            .node=${child}
            .errorsByPointer=${this.errorsByPointer}
          ></da-sc-field-section>
        `)}
      </fieldset>
    `;
  }

  _selectSelf() {
    this.dispatchEvent(new CustomEvent('form-intent', {
      detail: {
        type: 'form-nav-pointer-select',
        pointer: this.node?.pointer,
      },
      bubbles: true,
      composed: true,
    }));
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentObjectGroup);
}
