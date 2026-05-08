import { LitElement, html, nothing } from 'da-lit';

const EL_NAME = 'da-sc-object-group';

class StructuredContentObjectGroup extends LitElement {
  static properties = {
    node: { attribute: false },
    errorsByPointer: { attribute: false },
    activePointer: { attribute: false },
  };

  createRenderRoot() {
    return this;
  }

  render() {
    const { node } = this;
    if (!node) return nothing;

    const children = node.children ?? [];
    const required = node.required ? '*' : '';
    const active = this.activePointer === node.pointer;

    return html`
      <fieldset data-pointer=${node.pointer} class=${active ? 'active-section' : ''}>
        <legend @click=${this._selectSelf}>${node.label}${required}</legend>
        ${children.map((child) => html`
          <da-sc-field-section
            .node=${child}
            .errorsByPointer=${this.errorsByPointer}
            .activePointer=${this.activePointer}
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
        origin: 'editor',
      },
      bubbles: true,
      composed: true,
    }));
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentObjectGroup);
}
