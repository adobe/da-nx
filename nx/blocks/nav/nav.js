import { loadArea, getConfig, getMetadata } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';
import getSvg from '../../utils/svg.js';

const style = await getStyle(import.meta.url);

class NxNav extends HTMLElement {
  constructor() {
    super().attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [style];
    this.path = getMetadata('header-source') || getDefaultPath();
    getSvg({ parent: this.shadowRoot, paths: [`${new URL(import.meta.url).origin}/nx/img/logos/aec.svg`] });
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

    // Grab the first link as it will be the main branding
    const brandLink = doc.querySelector('a');
    brandLink.classList.add('nx-nav-brand');
    brandLink.insertAdjacentHTML('afterbegin', '<svg class="icon"><use href="#spectrum-ExperienceCloud"/></svg>');


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

function getDefaultPath() {
  const { origin } = new URL(import.meta.url);
  return `${origin}/nx/fragments/nx-nav`;
}

export default function init(el) {
  const nav = document.createElement('nx-nav');
  el.append(nav);
}
