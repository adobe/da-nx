import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import getStyle from '../../../utils/styles.js';

const root = import.meta.url.replace('/header/header.js', '');
const style = await getStyle(import.meta.url);

class NxLocHeader extends LitElement {
  static properties = {
    name: { type: String },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  render() {
    return html`
      <img class="header-bg" src="${root}/img/header-bg.jpg" />
      <div class="header-fg">
        <div class="header-fg-left">
          <p class="detail">Localization</p>
          <p class="heading">Welcome, <strong>${this.name}</strong></p>
        </div>
      </div>
    `;
  }
}

customElements.define('nx-loc-header', NxLocHeader);
