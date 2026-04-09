import { LitElement, html } from 'da-lit';

import { loadStyle } from '../../utils/utils.js';

const style = await loadStyle(import.meta.url);

class NXCanvasActions extends LitElement {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  render() {
    return html`
      <div class="canvas-actions">
        <button type="button" class="publish-btn">Publish</button>
      </div>
    `;
  }
}

customElements.define('nx-canvas-actions', NXCanvasActions);
