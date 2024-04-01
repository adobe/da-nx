import { LitElement, html, nothing } from '../../../deps/lit/lit-core.min.js';
import { getConfig } from '../../../scripts/nexter.js';
import getStyle from '../../../utils/styles.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

class NxLocCard extends LitElement {
  static properties = {
    total: { attribute: false },
    lang: { attribute: false },
    complete: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
  }

  handleRollout() {
    const opts = { detail: { lang: this.lang }, bubbles: true, composed: true };
    const onRollout = new CustomEvent('on-rollout', opts);
    this.dispatchEvent(onRollout);
  }

  render() {
    let status = 'not-started';
    if (this.complete > 0) status = 'rolling-out';
    if (this.complete === this.lang.total) status = 'complete';

    return html`
      <div class="nx-lang-card-top nx-lang-status-${status}">
        <p class="detail">Language</p>
        <p class="nx-card-heading">${this.lang.language}</p>
        <p class="detail">Action</p>
        <p class="nx-card-heading">${this.lang.action}</p>
      </div>
      <div class="nx-lang-card-middle">
        <div class="nx-card-totals">
          <div class="totals-left">
            <p class="detail">Items</p>
            <p class="nx-card-heading">${this.total}</p>
          </div>
          <div class="totals-right">
            <p class="detail">Complete</p>
            <p class="nx-card-heading">${this.complete} of ${this.lang.total}</p>
          </div>
        </div>
        <div class="nx-lang-card-locales">
          <button class="action">langstore</button>
          ${Object.keys(this.lang.locales).map((key) => html`<button class="action">${key}</button>`)}
        </div>
      </div>
      <div class="nx-lang-card-actions">
        <button class="primary" @click=${() => this.handleRollout()}>Rollout</button>
      </div>
    `;
  }
}

customElements.define('nx-loc-card', NxLocCard);
