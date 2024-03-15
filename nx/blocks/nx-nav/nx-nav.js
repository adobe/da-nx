import { loadArea } from '../../scripts/nexter.js';
import getStyle from '../../scripts/styles.js';

const style = await getStyle(import.meta.url);

class NxNav extends HTMLElement {
  constructor() {
    super().attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  connectedCallback() {
    this.render();
  }

  async fetchNav() {
    const resp = await fetch(`${this.path}.plain.html`);
    if (!resp.ok) return;
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    await loadArea(doc.body);
    const sections = doc.querySelectorAll('body > .section');
    const inner = document.createElement('div');
    inner.className = 'nx-nav-inner';
    inner.append(...sections);
    return inner;
  }

  async render() {
    const nav = await this.fetchNav();
    this.shadowRoot.append(nav);
    delete this.closest('header').dataset.status;
  }
}

customElements.define('nx-nav', NxNav);

export default function init(el) {
  const nav = document.createElement('nx-nav');
  nav.path = el.dataset.path || '/nx/fragments/nx-nav';
  el.append(nav);
}
