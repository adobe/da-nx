import { getConfig, loadArea, getMetadata } from '../../scripts/nexter.js';
import loadStyle from '../../utils/styles.js';
import getSvg from '../../utils/svg.js';

const { nxBase } = getConfig();

const ICONS = [
  `${nxBase}/img/logos/aec.svg`,
  `${nxBase}/img/icons/S2IconHelp20N-icon.svg`,
];

function getDefaultPath() {
  const { origin } = new URL(import.meta.url);
  return `${origin}/fragments/nx-nav`;
}
class Nav extends HTMLElement {
  constructor() {
    super().attachShadow({ mode: 'open' });
    this.path = getMetadata('header-source') || getDefaultPath();
  }

  async connectedCallback() {
    const style = await loadStyle(import.meta.url);
    this.shadowRoot.adoptedStyleSheets = [style];
    await getSvg({ parent: this.shadowRoot, paths: ICONS });
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
    brandLink.innerHTML = `<span>${brandLink.innerHTML}</span>`;
    brandLink.classList.add('nx-nav-brand');
    brandLink.insertAdjacentHTML('afterbegin', '<svg class="icon"><use href="#spectrum-ExperienceCloud"/></svg>');

    const inner = document.createElement('div');
    inner.className = 'nx-nav-inner';
    inner.append(...sections);
    return inner;
  }

  async renderHelp() {
    const helpBtn = document.createElement('button');
    helpBtn.classList.add('nx-nav-help');
    helpBtn.setAttribute('aria-label', 'Help & legal');
    helpBtn.innerHTML = '<svg class="icon"><use href="#S2Help20N-icon"/></svg>';

    helpBtn.addEventListener('click', async () => {
      const open = (await import('../modal/modal.js')).default;
      open('/fragments/nav/help');
    });
    return helpBtn;
  }

  async getProfile() {
    await import('../profile/profile.js');
    return document.createElement('nx-profile');
  }

  async renderActions() {
    const navActions = document.createElement('div');
    navActions.classList.add('nx-nav-actions');

    const help = this.renderHelp();
    const profile = this.getProfile();

    const [helpEl, profileEl] = await Promise.all([help, profile]);
    navActions.append(helpEl, profileEl);

    return navActions;
  }

  async render() {
    const nav = await this.fetchNav();
    this.shadowRoot.append(nav);

    const navActions = await this.renderActions();
    this.shadowRoot.append(navActions);
    delete this.closest('header').dataset.status;
  }
}

async function loadSideNav(el) {
  await import('../sidenav/sidenav.js');
  el.insertAdjacentHTML('afterend', '<nx-sidenav data-rum></nx-sidenav>');
}

customElements.define('nx-nav', Nav);

export default function init(el) {
  const nav = document.createElement('nx-nav');
  nav.dataset.rum = '';
  el.append(nav);
  if (el.nextElementSibling.nodeName === 'MAIN') loadSideNav(el);
}
