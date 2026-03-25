// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';

const style = await getStyle(import.meta.url);

/**
 * @fires sl-browse-toast-close
 * @customElement sl-browse-toast-host
 */
export class SlBrowseToastHost extends LitElement {
  static properties = {
    open: { type: Boolean },
    text: { type: String },
    /** @type {'info' | 'positive' | 'negative'} */
    variant: { type: String },
  };

  constructor() {
    super();
    this.open = false;
    this.text = '';
    this.variant = 'info';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  _onClose() {
    this.dispatchEvent(new CustomEvent('sl-browse-toast-close', { bubbles: true, composed: true }));
  }

  render() {
    return html`
      <div class="sl-browse-toast-host" aria-live="polite">
        <sp-toast
          variant="${this.variant}"
          .timeout="${6000}"
          ?open="${this.open}"
          @close="${this._onClose}"
        >
          ${this.text}
        </sp-toast>
      </div>
    `;
  }
}

customElements.define('sl-browse-toast-host', SlBrowseToastHost);
