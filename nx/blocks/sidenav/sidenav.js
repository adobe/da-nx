import { loadArea, getMetadata, getConfig } from '../../scripts/nexter.js';
import loadStyle from '../../utils/styles.js';
import { link2svg } from '../../utils/svg.js';

const HASH_AWARE = ['Home', 'Apps'];
const NEW_UI_PREFIX = '/app/hannessolo/exp-workspace';
const NEW_UI_FRAGMENT_PATH = 'https://main--exp-workspace--hannessolo.aem.live/fragments/sidenav';

function getDefaultPath() {
  const { nxBase } = getConfig();
  return `${nxBase}/fragments/nx-sidenav`;
}

class SideNav extends HTMLElement {
  constructor() {
    super().attachShadow({ mode: 'open' });
    this.path = getMetadata('sidenav-source') || getDefaultPath();
  }

  async connectedCallback() {
    const style = await loadStyle(import.meta.url, this.shadowRoot);
    this.shadowRoot.adoptedStyleSheets = [style];
    this.nav = await this.fetchNav();
    this.render();
  }

  async decorateIcons(area) {
    const links = [...area.querySelectorAll('a')];
    const svgs = links.map(async (link) => link2svg(link, this.shadowRoot));
    await Promise.all(svgs);
  }

  async fetchNav() {
    const path = window.location.pathname.startsWith(NEW_UI_PREFIX)
      ? NEW_UI_FRAGMENT_PATH
      : (getMetadata('sidenav-source') || getDefaultPath());
    const resp = await fetch(`${path}.plain.html`);
    if (!resp.ok) return null;
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    await loadArea(doc.body);
    const list = doc.querySelector('ul');
    await this.decorateIcons(list);

    const anchors = doc.querySelectorAll('a');
    anchors.forEach((a) => {
      const hashAware = HASH_AWARE.some((name) => name === a.title);
      if (!hashAware) return;
      a.addEventListener('click', (e) => {
        if (window.location.hash?.startsWith('#/')) {
          e.preventDefault();
          const hashPath = window.location.hash.slice(2);
          if (hashPath) {
            const hash = `#/${hashPath}`;
            window.open(`${a.href}${hash}`, `${a.href}${hash}`);
            return;
          }
          window.open(a.href, a.href);
        }
      });
    });

    const inner = document.createElement('div');
    inner.className = 'nx-sidenav-inner';
    inner.append(list);
    return inner;
  }

  async render() {
    this.shadowRoot.append(this.nav);
  }
}

customElements.define('nx-sidenav', SideNav);

export default function init(el) {
  const sidenav = document.createElement('nx-sidenav');
  el.append(sidenav);
}
