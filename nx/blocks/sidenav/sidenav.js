import { loadArea, getMetadata, getConfig } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';
import getSvg, { link2svg } from '../../utils/svg.js';

const style = await getStyle(import.meta.url);

function getDefaultPath() {
  const { nxBase } = getConfig();
  return `${nxBase}/fragments/nx-sidenav`;
}

class SideNav extends HTMLElement {
  constructor() {
    super().attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [style];
    this.path = getMetadata('sidenav-source') || getDefaultPath();
  }

  connectedCallback() {
    this.render();
  }

  async decorateIcons(area) {
    const links = [...area.querySelectorAll('a')];
    const svgs = links.map(async (link) => link2svg(link, this.shadowRoot));
    await Promise.all(svgs);
  }

  async fetchNav() {
    const resp = await fetch(`${this.path}.plain.html`);
    if (!resp.ok) return null;
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    await loadArea(doc.body);
    const list = doc.querySelector('ul');
    await this.decorateIcons(list);

    const inner = document.createElement('div');
    inner.className = 'nx-sidenav-inner';
    inner.append(list);
    return inner;
  }

  async render() {
    const nav = await this.fetchNav();
    this.shadowRoot.append(nav);
  }
}

customElements.define('nx-sidenav', SideNav);

export default function init(el) {
  const sidenav = document.createElement('nx-sidenav');
  el.append(sidenav);
}
