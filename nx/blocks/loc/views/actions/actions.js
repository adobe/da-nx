import { LitElement, html, nothing } from 'da-lit';
import config from '../../../../../nx2/utils/nxToggle.js';
import { loadStyle } from '../../../../../nx2/utils/utils.js';
import loadIcons from '../../../../../nx2/utils/svg.js';
import { VIEWS } from '../../utils/steps.js';

const style = await loadStyle(import.meta.url);

const { nxBase: nx } = config;

const ICONS = [
  `${nx}/public/icons/Smock_ChevronLeft_18_N.svg`,
  `${nx}/public/icons/Smock_ChevronRight_18_N.svg`,
];
const icons = await loadIcons({ paths: ICONS });

class NxLocActions extends LitElement {
  static properties = {
    project: { attribute: false },
    message: { attribute: false },
    _prev: { state: true },
    _next: { state: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.shadowRoot.append(...icons);
    this.getActions();
  }

  update(props) {
    if (props.has('project')) this.getActions();
    super.update();
  }

  getActions() {
    const { prev, next } = VIEWS[this.project.view](this.project);
    this._prev = prev;
    this._next = next;
  }

  handleAction({ view, hash, href }) {
    const opts = { detail: { view, hash, href }, composed: false };
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
        <button class="nx-prev" @click=${() => this.handleAction(this._prev)}>
          <svg class="icon"><use href="#spectrum-chevronLeft"/></svg>
          <span>${this._prev.text}</span>
        </button>
        ${this.renderMessage()}
        <button class="nx-next ${this._next.style}" @click=${() => this.handleAction(this._next)} ?disabled=${this._next.disabled}>
            <span>${this._next.text}</span>
            <svg class="icon"><use href="#spectrum-chevronRight"/></svg>
        </button>
      </div>`;
  }
}

customElements.define('nx-loc-actions', NxLocActions);
