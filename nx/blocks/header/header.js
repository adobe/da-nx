import { LitElement, html, nothing } from 'lit';

import { loadStyle } from '../../scripts/utils/style.js';

const style = await loadStyle(import.meta.url);

class NXHeader extends LitElement {
  static properties = {
    title: { type: String },
    _brandLink: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.loadNav();
  }

  async loadNav() {
    const resp = await fetch('/fragments/nav/header');
    if (!resp.ok) return;
    const navhtml = await resp.text();
    const doc = new DOMParser().parseFromString(navhtml, 'text/html');
    this._brandLink = doc.querySelector('a');
  }

  handleScheme(e) {
    e.preventDefault();
    const { body } = document;

    let currPref = localStorage.getItem('color-scheme');
    if (!currPref) {
      currPref = matchMedia('(prefers-color-scheme: dark)')
        .matches ? 'dark-scheme' : 'light-scheme';
    }

    const theme = currPref === 'dark-scheme'
      ? { add: 'light-scheme', remove: 'dark-scheme' }
      : { add: 'dark-scheme', remove: 'light-scheme' };

    body.classList.remove(theme.remove);
    body.classList.add(theme.add);
    localStorage.setItem('color-scheme', theme.add);
  }

  render() {
    if (!this._brandLink) return nothing;

    return html`
      <a class="brand-icon" href=${this._brandLink.href} @click=${this.handleScheme}>
        <svg viewBox="0 0 24 24"><use href="/nx/img/logos/aec.svg#aec"/></svg>
      </a>
      <div class="brand-link">
        ${this._brandLink}
      </div>`;
  }
}

customElements.define('nx-header', NXHeader);

export default function init(el) {
  el.append(document.createElement('nx-header'));
}
