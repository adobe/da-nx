import { LitElement, html, nothing } from 'da-lit';
import getStyle from '../../../../utils/styles.js';

const root = import.meta.url.replace('/views/header/header.js', '');
const style = await getStyle(import.meta.url);

class NxLocHeader extends LitElement {
  static properties = {
    view: { attribute: false },
    title: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  getDisplayTitle() {
    if (this.view === 'dashboard') return 'Dashboard';
    if (this.view === 'basics' && !this.title) return 'New project';
    if (this.title) return this.title;
    return null;
  }

  render() {
    const displayTitle = this.getDisplayTitle();

    return html`
      <img class="header-bg" src="${root}/img/header-bg.jpg" />
      <div class="header-fg">
        ${displayTitle ? html`
          <div class="header-fg-left">
            <p class="detail">Localization</p>
            <p class="heading">${displayTitle}</p>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

customElements.define('nx-loc-header', NxLocHeader);
