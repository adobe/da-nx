import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../../../scripts/nexter.js';
import getStyle from '../../../../utils/styles.js';
import getSvg from '../../../../utils/svg.js';
import VIEWS from './index.js';

const style = await getStyle(import.meta.url);

const { nxBase: nx } = getConfig();

const ICONS = [
  `${nx}/img/icons/Smock_ChevronLeft_18_N.svg`,
  `${nx}/img/icons/Smock_ChevronRight_18_N.svg`,
];

class NxLocActions extends LitElement {
  static properties = {
    project: { attribute: false },
    message: { attribute: false },
    view: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  handleAction(direction) {
    const { href, view } = VIEWS[this.view][direction].view(this.project);
    const { save } = VIEWS[this.view][direction];

    const opts = { detail: { href, view, save }, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  renderMessage() {
    if (!this.message) return nothing;
    return html`<p class="message type-${this.message.type || 'info'}">${this.message.text}</p>`;
  }

  render() {
    return html`
      <div class="nx-loc-actions-header">
        <button class="nx-prev" @click=${() => this.handleAction('prev')}>
          <svg class="icon"><use href="#spectrum-chevronLeft"/></svg>
          <span>${VIEWS[this.view].prev.text(this.project)}</span>
        </button>
        ${this.renderMessage()}
        <button class="nx-next ${this.nextStyle ? this.nextStyle : ''}"
          @click=${() => this.handleAction('next')}
          ?disabled=${!VIEWS[this.view].next.enabled(this.project)}>
            <span>${VIEWS[this.view].next.text(this.project)}</span>
            <svg class="icon"><use href="#spectrum-chevronRight"/></svg>
        </button>
      </div>`;
  }
}

customElements.define('nx-loc-actions', NxLocActions);
