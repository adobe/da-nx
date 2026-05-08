import { LitElement, html, nothing } from 'da-lit';
import '../fields/text-field.js';
import '../fields/number-field.js';
import '../fields/checkbox-field.js';
import '../fields/select-field.js';
import './object-group.js';
import './array-field.js';

const EL_NAME = 'da-sc-field-section';

class StructuredContentFieldSection extends LitElement {
  static properties = {
    node: { attribute: false },
    errorsByPointer: { attribute: false },
  };

  _getError(pointer) {
    return this.errorsByPointer?.get(pointer) ?? '';
  }

  _getPrimitiveValue(node) {
    if (!node) return undefined;
    if (node.sourceValue !== undefined) return node.sourceValue;
    if (node.kind === 'boolean') return false;
    if (node.defaultValue !== undefined) return node.defaultValue;
    return '';
  }

  _renderPrimitive(node) {
    const error = this._getError(node.pointer);
    const value = this._getPrimitiveValue(node);

    if (Array.isArray(node.enumValues)) {
      return html`
        <da-sc-select-field
          .node=${node}
          .value=${value}
          .error=${error}
        ></da-sc-select-field>
      `;
    }

    if (node.kind === 'boolean') {
      return html`
        <da-sc-checkbox-field
          .node=${node}
          .value=${value}
          .error=${error}
        ></da-sc-checkbox-field>
      `;
    }

    if (node.kind === 'number' || node.kind === 'integer') {
      return html`
        <da-sc-number-field
          .node=${node}
          .value=${value}
          .error=${error}
        ></da-sc-number-field>
      `;
    }

    if (node.kind === 'string') {
      return html`
        <da-sc-text-field
          .node=${node}
          .value=${value}
          .error=${error}
        ></da-sc-text-field>
      `;
    }

    return nothing;
  }

  render() {
    const node = this.node;
    if (!node) return nothing;

    if (node.kind === 'object') {
      return html`
        <da-sc-object-group
          .node=${node}
          .errorsByPointer=${this.errorsByPointer}
        ></da-sc-object-group>
      `;
    }

    if (node.kind === 'array') {
      return html`
        <da-sc-array-field
          .node=${node}
          .errorsByPointer=${this.errorsByPointer}
        ></da-sc-array-field>
      `;
    }

    return this._renderPrimitive(node);
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentFieldSection);
}
