import { LitElement, html, nothing } from 'da-lit';

const EL_NAME = 'da-sc-object-group';

class StructuredContentObjectGroup extends LitElement {
  static properties = {
    node: { attribute: false },
    errorsByPointer: { attribute: false },
  };

  render() {
    const node = this.node;
    if (!node) return nothing;

    const children = node.children ?? [];
    const required = node.required ? '*' : '';

    return html`
      <fieldset>
        <legend>${node.label}${required}</legend>
        ${children.map((child) => html`
          <da-sc-field-section
            .node=${child}
            .errorsByPointer=${this.errorsByPointer}
          ></da-sc-field-section>
        `)}
      </fieldset>
    `;
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentObjectGroup);
}
