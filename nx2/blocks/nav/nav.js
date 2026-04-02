import { LitElement, html } from 'da-lit';
import { getMetadata } from '../../scripts/nx.js';

import { loadStyle } from '../../utils/utils.js';
import { loadFragment } from '../fragment/fragment.js';
import { loadHrefSvg } from '../../utils/svg.js';

const DEFAULT_NAV_PATH = '/nx/fragments/nav';

const style = await loadStyle(import.meta.url);

class NXNav extends LitElement {
  static properties = {
    path: { attribute: false },
    _brand: { state: true },
    _actions: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.loadNav();
  }

  change(props) {
    if (props.has('path') && this.path) {
      this.loadNav();
    }
  }

  async loadNav() {
    const fragment = await loadFragment(this._path);
    if (!fragment) return;
    const sections = [...fragment.querySelectorAll('.section')];
    this._brand = await this.decorateBrand(sections[0]);
    this._actions = await this.decorateActions(sections.pop());
  }

  async decorateBrand(brandSection) {
    // The first link will always be at least an icon
    const brandLink = brandSection.querySelector('a');
    if (!brandLink) return null;
    const { href, textContent } = brandLink;

    // Attempt to find a lockup svg
    const hasLockup = href.includes('.svg');
    if (hasLockup) {
      brandLink.setAttribute('aria-label', textContent);
      brandLink.textContent = '';
      const lockup = await loadHrefSvg(href);
      brandLink.append(lockup);
    }
    brandLink.href = '/';

    return brandLink;
  }

  async decorateActions(section) {
    const ul = section.querySelector('ul');
    for (const child of ul.children) {
      const button = child.querySelector('button');
      if (!button) {
        const name = child.textContent.trim();
        await import(`../${name}/${name}.js`);
        const cmp = document.createElement(`nx-${name}`);
        child.replaceChildren(cmp);
      }
    }
    return ul;
  }

  get _path() {
    return getMetadata('nav-path') || this.path || DEFAULT_NAV_PATH;
  }

  render() {
    return html`
      <div class="brand-area">
        ${this._brand}
      </div>
      <div class="action-area">
        ${this._actions}
      </div>
      `;
  }
}

customElements.define('nx-nav', NXNav);
