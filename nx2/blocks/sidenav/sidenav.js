import { LitElement, html, nothing } from 'lit';

import { loadFragment } from '../fragment/fragment.js';
import { loadStyle, HashController } from '../../utils/utils.js';

const DEFAULT_NAV_PATH = '/nx/fragments/sidenav';

const style = await loadStyle(import.meta.url);

class NXSidenav extends LitElement {
  details = new HashController(this);

  static properties = {
    path: { attribute: false },
    _navLinks: { state: true },
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
    // Format the links down so we can manipulate them easier
    this._navLinks = [...fragment.querySelectorAll('a')].map((link) => ({
      icon: link.querySelector('.icon'),
      text: link.textContent.trim(),
      href: link.href,
    }));
  }

  getActiveClass(a) {
    const { location } = window;
    // Don't consider anything off origin
    if (!a.href.startsWith(location.origin)) return '';
    const { pathname } = new URL(a.href);
    // Return if exact match
    if (pathname === location.pathname) return 'is-active';
    // Any descendant would be considered active
    if (pathname !== '/' && location.pathname.startsWith(pathname)) return 'is-active';
    // Unknown
    return '';
  }

  get _path() {
    return this.path || DEFAULT_NAV_PATH;
  }

  render() {
    if (!this._navLinks) return nothing;

    return html`
      <ul>
        ${this._navLinks.map((a) => html`
          <li class="nav-link ${this.getActiveClass(a)}"><a href="${a.href}">${a.icon}${a.text}</a></li>
        `)}
      </ul>
    `;
  }
}

customElements.define('nx-sidenav', NXSidenav);
