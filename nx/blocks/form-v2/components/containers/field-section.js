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
    activePointer: { attribute: false },
    arrayItemIndex: { attribute: false },
    arrayItemPointers: { attribute: false },
    arrayReadonly: { attribute: false },
    arrayItemCount: { attribute: false },
    arrayMinItems: { attribute: false },
    arrayMaxItems: { attribute: false },
    reorderActivePointer: { attribute: false },
  };

  createRenderRoot() {
    return this;
  }

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

  _renderUnsupported(node) {
    const unsupported = node?.unsupported ?? {};
    const combinator = unsupported.combinator ?? 'unknown';
    const variants = unsupported.variants ?? 0;
    const variantText = variants > 0 ? ` (${variants} variant${variants === 1 ? '' : 's'})` : '';

    return html`
      <div
        class="unsupported-subtree"
        data-pointer=${node.pointer}
        aria-live="polite"
      >
        <p class="unsupported-subtree-title">
          ${node.label}${node.required ? html`<span class="is-required">*</span>` : nothing}
        </p>
        <p class="unsupported-subtree-warning">
          This section is read-only because schema combinator
          <strong>${combinator}</strong>${variantText} is not supported yet.
        </p>
      </div>
    `;
  }

  render() {
    const { node } = this;
    if (!node) return nothing;

    if (node.kind === 'unsupported') {
      return this._renderUnsupported(node);
    }

    if (node.kind === 'object') {
      return html`
        <da-sc-object-group
          .node=${node}
          .errorsByPointer=${this.errorsByPointer}
          .activePointer=${this.activePointer}
          .arrayItemIndex=${this.arrayItemIndex}
          .arrayItemPointers=${this.arrayItemPointers}
          .arrayReadonly=${this.arrayReadonly}
          .arrayItemCount=${this.arrayItemCount}
          .arrayMinItems=${this.arrayMinItems}
          .arrayMaxItems=${this.arrayMaxItems}
          .reorderActivePointer=${this.reorderActivePointer}
        ></da-sc-object-group>
      `;
    }

    if (node.kind === 'array') {
      return html`
        <da-sc-array-field
          .node=${node}
          .errorsByPointer=${this.errorsByPointer}
          .activePointer=${this.activePointer}
        ></da-sc-array-field>
      `;
    }

    return this._renderPrimitive(node);
  }
}

if (!customElements.get(EL_NAME)) {
  customElements.define(EL_NAME, StructuredContentFieldSection);
}
