import { LitElement, html } from 'lit';
import { getMetadata } from '../../scripts/nx.js';

import { loadStyle } from '../../utils/style.js';
import { loadFragment } from '../fragment/fragment.js';
import { loadHrefSvg } from '../../utils/icons.js';

const DEFAULT_NAV_PATH = '/fragments/nav/header';

const style = await loadStyle(import.meta.url);

class NXHeader extends LitElement {
  static properties = {
    navPath: { attribute: false },
    _brand: { state: true },
    _actions: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.loadNav();
  }

  change(props) {
    if (props.has('navPath') && this.navPath) {
      this.loadNav();
    }
  }

  async loadNav() {
    const fragment = await loadFragment(this.navPath);
    const sections = [...fragment.querySelectorAll('.section')];
    this._brand = await this.decorateBrand(sections[0]);
    this._actions = this.decorateActions(sections.pop());
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

  decorateActions(section) {
    const ul = section.querySelector('ul');
    ul.className = 'actions-list';
    return ul;
  }

  handleProfileReady() {
    console.log('Ready!');
  }

  render() {
    return html`
      <div class="brand-area">
        ${this._brand}
      </div>
      <div class="action-area" @loaded=${this.handleProfileReady}>
        ${this._actions}
      </div>
      `;
  }
}

customElements.define('nx-header', NXHeader);

export default function init(el) {
  const navHref = getMetadata('nav');
  const navPath = navHref ? new URL(navHref).pathname : DEFAULT_NAV_PATH;
  const cmp = document.createElement('nx-header');
  cmp.navPath = navPath;
  el.append(cmp);
}
