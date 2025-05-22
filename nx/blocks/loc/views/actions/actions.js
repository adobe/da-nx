import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';

const style = await getStyle(import.meta.url);

const { nxBase: nx } = getConfig();

const ICONS = [
  `${nx}/img/icons/Smock_ChevronLeft_18_N.svg`,
  `${nx}/img/icons/Smock_ChevronRight_18_N.svg`,
];

class NxLocActions extends LitElement {
  static properties = {
    prev: { type: String },
    prevDisabled: { type: Boolean },
    nextDisabled: { type: Boolean },
    nextStyle: { type: String },
    next: { type: String },
    message: { attribute: false },
    skipSave: { type: Boolean },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  handleAction(e, name) {
    console.log(e);
    const detail = name === 'next' && this.skipSave ? { name, skipSave: true } : { name };

    const opts = { detail, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  render() {
    return html`
      <div class="nx-loc-actions-header">
        <button @click=${(e) => this.handleAction(e, 'prev')} class="nx-prev" ?disabled=${this.prevDisabled}>
          <svg class="icon"><use href="#spectrum-chevronLeft"/></svg>
          <span>${this.prev}</span>
        </button>
        ${this.message ? html`<p class="message type-${this.message.type || 'info'}">${this.message.text}</p>` : nothing}
        <button @click=${(e) => this.handleAction(e, 'next')} class="nx-next ${this.nextStyle ? this.nextStyle : ''}" ?disabled=${this.nextDisabled}>
          <span>${this.next}</span>
          <svg class="icon"><use href="#spectrum-chevronRight"/></svg>
        </button>
      </div>`;
  }
}

customElements.define('nx-loc-actions', NxLocActions);
