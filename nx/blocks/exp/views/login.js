import { html, LitElement } from 'da-lit';
import getStyle from '../../../utils/styles.js';

const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const style = await getStyle(import.meta.url);

class NxExpLogin extends LitElement {
  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, style];
  }

  async handleSignIn() {
    window.adobeIMS.signIn();
  }

  render() {
    return html`
      <div class="nx-new">
        <img
          alt=""
          src="${nx}/img/icons/S2IconUsersNo20N-icon.svg"
          class="nx-new-icon nx-space-bottom-200" />
        <p class="sl-heading-m nx-space-bottom-100">${this.strings.login.title}</p>
        <p class="sl-body-xs nx-space-bottom-300">${this.strings.login.message}</p>
        <div class="nx-new-action-area">
          <sl-button @click=${this.handleSignIn}>Sign in</sl-button>
        </div>
      </div>`;
  }
}

customElements.define('nx-exp-login', NxExpLogin);
