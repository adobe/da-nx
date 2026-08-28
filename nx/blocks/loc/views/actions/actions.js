import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../../../nx2/utils/utils.js';
import { VIEWS } from '../../utils/steps.js';

const style = await loadStyle(import.meta.url);

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
          <svg class="icon" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-chevronleft-20-n.svg#icon"/></svg>
          <span>${this._prev.text}</span>
        </button>
        ${this.renderMessage()}
        <button class="nx-next ${this._next.style}" @click=${() => this.handleAction(this._next)} ?disabled=${this._next.disabled}>
            <span>${this._next.text}</span>
            <svg class="icon" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-chevronright-20-n.svg#icon"/></svg>
        </button>
      </div>`;
  }
}

customElements.define('nx-loc-actions', NxLocActions);
