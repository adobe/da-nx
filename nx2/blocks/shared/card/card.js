import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';

const styles = await loadStyle(import.meta.url);

export default class NxCard extends LitElement {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  render() {
    return html`
      <div class="card">
        <div class="preview">
          <slot name="preview"></slot>
          <div class="selection"><slot name="selection"></slot></div>
          <div class="badge"><slot name="badge"></slot></div>
        </div>
        <div class="heading">
          <slot name="title"></slot>
          <slot name="actions"></slot>
        </div>
        <div class="metadata"><slot name="metadata"></slot></div>
      </div>`;
  }
}

customElements.define('nx-card', NxCard);
