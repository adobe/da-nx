import { LitElement, html, nothing } from 'da-lit';

import { loadFragment } from '../fragment/fragment.js';
import { loadStyle, getHomeHref } from '../../utils/utils.js';

const DEFAULT_NAV_PATH = '/nx/fragments/sidenav';
const HASH_AWARE = ['Home', 'Apps'];

const styles = await Promise.all([
  loadStyle(import.meta.url),
  loadStyle(new URL('../../styles/buttons.css', import.meta.url).href),
]);

class NXSidenav extends LitElement {
  static properties = {
    path: { attribute: false },
    actions: { attribute: false },
    _navLinks: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = styles;
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

  handleClick(e, a) {
    if (!HASH_AWARE.includes(a.text)) return;
    if (a.text === 'Home') {
      e.currentTarget.href = getHomeHref({ fallback: a.href });
      if (e.currentTarget.href !== a.href) return;
    }
    if (!window.location.hash?.startsWith('#/')) return;
    e.preventDefault();
    const [org, repo] = window.location.hash.slice(2).split('/');
    const target = org && repo ? `${a.href}#/${org}/${repo}` : a.href;
    window.open(target, target);
  }

  get _path() {
    return this.path || DEFAULT_NAV_PATH;
  }

  render() {
    if (!this._navLinks) return nothing;

    return html`
      <ul>
        ${this.actions?.map((action) => html`
          <li class="nav-action">
            <button type="button" class="nx-action-btn-icon"
              aria-label=${action.label} title=${action.label}
              ?disabled=${action.disabled} @click=${action.onClick}>
              <img src=${action.icon} width="32" height="32" alt="">
            </button>
          </li>
        `)}
        ${this._navLinks.map((a) => html`
          <li class="nav-link ${this.getActiveClass(a)}"><a href="${a.text === 'Home' ? getHomeHref({ fallback: a.href }) : a.href}" @click=${(e) => this.handleClick(e, a)}>${a.icon}${a.text}</a></li>
        `)}
      </ul>
    `;
  }
}

customElements.define('nx-sidenav', NXSidenav);
