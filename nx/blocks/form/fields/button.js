import { LitElement, html } from 'da-lit';
import { loadStyle } from '../../../../nx2/utils/utils.js';

const style = await loadStyle(import.meta.url);

class SlButton extends LitElement {
  static properties = {
    disabled: { type: Boolean, reflect: true },
    // Spectrum variant: 'accent' (default) or 'secondary'.
    variant: { reflect: true },
  };

  constructor() {
    super();
    this.variant = 'accent';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  render() {
    // Disabled <button> swallows the click; callers bind @click on the host.
    return html`
      <button class="sl-button" type="button" ?disabled=${this.disabled}>
        <slot></slot>
      </button>
    `;
  }
}

if (!customElements.get('sl-button')) customElements.define('sl-button', SlButton);

export default SlButton;
