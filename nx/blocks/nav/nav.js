import { loadArea, getMetadata } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';
import getSvg from '../../utils/svg.js';

const style = await getStyle(import.meta.url);

function getDefaultPath() {
  const { origin } = new URL(import.meta.url);
  return `${origin}/nx/fragments/nx-nav`;
}
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
    if (!resp.ok) return null;
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

  renderProfile(signOut, profile) {
    const button = document.createElement('button');
    if (profile.io.user.avatar) {
      const img = document.createElement('img');
      img.src = profile.io.user.avatar;
      button.append(img);
    }
    button.className = 'nx-nav-btn nx-nav-btn-sign-out';
    return button;
  }

  renderSignin(signIn) {
    const button = document.createElement('button');
    button.textContent = 'Sign in';
    button.className = 'nx-nav-btn nx-nav-btn-sign-in';
    button.addEventListener('click', signIn);
    return button;
  }

  async getProfile() {
    const { loadIms, handleSignIn, handleSignOut } = await import('../../utils/ims.js');
    try {
      const profile = await loadIms();
      if (profile.anonymous) return this.renderSignin(handleSignIn);
      return this.renderProfile(handleSignOut, profile);
    } catch {
      return null;
    }
  }

  async render() {
    const nav = await this.fetchNav();
    this.shadowRoot.append(nav);
    delete this.closest('header').dataset.status;
    const profile = await this.getProfile();
    if (profile) this.shadowRoot.append(profile);
  }
}

customElements.define('nx-nav', NxNav);

export default function init(el) {
  const nav = document.createElement('nx-nav');
  el.append(nav);
}
