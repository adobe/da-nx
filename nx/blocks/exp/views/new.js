import { html, LitElement } from 'da-lit';
import getStyle from '../../../utils/styles.js';
import { getDefaultData, processDetails } from '../utils.js';

const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const style = await getStyle(import.meta.url);

class NxExpNew extends LitElement {
  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, style];
  }

  handleNew() {
    const defData = getDefaultData(this.page);
    const details = processDetails(defData);
    const opts = { detail: { action: 'new', details }, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  render() {
    return html`
      <div class="nx-new">
        <img
          alt=""
          src="${nx}/img/icons/S2IconUsersNo20N-icon.svg"
          class="nx-new-icon nx-space-bottom-200" />
        <p class="sl-heading-m nx-space-bottom-100">No experiments on this page.</p>
        <p class="sl-body-xs nx-space-bottom-300">
          Create a new experiment to start optimizing your web page.
        </p>
        <div class="nx-new-action-area">
          <sl-button @click=${this.handleNew}>Create new</sl-button>
        </div>
      </div>`;
  }
}

customElements.define('nx-exp-new', NxExpNew);
