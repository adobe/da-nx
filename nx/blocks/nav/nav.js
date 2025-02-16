import { DA_ORIGIN } from '../../public/utils/constants.js';
import { getConfig, loadArea, getMetadata } from '../../scripts/nexter.js';
import { daFetch } from '../../utils/daFetch.js';
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
    brandLink.classList.add('nx-nav-brand');
    brandLink.insertAdjacentHTML('afterbegin', '<svg class="icon"><use href="#spectrum-ExperienceCloud"/></svg>');

    const inner = document.createElement('div');
    inner.className = 'nx-nav-inner';
    inner.append(...sections);
    return inner;
  }

  renderOrg(currentOrg) {
    return `
      <li>
        <p class="nx-nav-profile-menu-item-header">Org</p>
        <p class="nx-nav-profile-menu-item-text">${currentOrg}</p>
      </li>`;
  }

  async renderProfile(signOut, details) {
    const orgs = await details.getOrgs();

    const currentOrg = Object.keys(orgs).find((key) => {
      const fullIdent = `${orgs[key].orgRef.ident}@${orgs[key].orgRef.authSrc}`;
      return fullIdent === details.ownerOrg;
    });

    const imgSrc = details?.io?.user?.avatar || `${import.meta.url.replace('nav.js', 'img/default-profile.png')}`;

    const profileMenu = `
      <button class="nx-nav-btn nx-nav-btn-profile"><img src="${imgSrc}"/></button>
      <div class="nx-nav-profile-menu">
        <ul>
          ${currentOrg ? this.renderOrg(currentOrg) : ''}
          <li>
            <p class="nx-nav-profile-menu-item-header">User ID</p>
            <p class="nx-nav-profile-menu-item-text">${details.userId}</p>
          </li>
          <li class="nx-nav-profile-list-item">
            <button class="nx-nav-profile-list-item-signout">Sign out</button>
          </li>
        </ul>
      </div>
    `;

    const profileWrapper = document.createElement('div');
    profileWrapper.classList.add('nx-nav-profile');

    const fragment = new DocumentFragment();
    fragment.append(profileWrapper);
    profileWrapper.insertAdjacentHTML('afterbegin', profileMenu);
    profileWrapper.querySelector('.nx-nav-btn-profile').addEventListener('click', () => {
      profileWrapper.querySelector('.nx-nav-profile-menu').classList.toggle('is-visible');
    });
    const signoutEl = profileWrapper.querySelector('.nx-nav-profile-list-item-signout');
    signoutEl.addEventListener('click', async () => {
      try {
        await daFetch(`${DA_ORIGIN}/logout`);
      } catch {
        // logout did not work.
      }
      signOut();
    });
    return fragment;
  }

  async renderHelp() {
    const helpBtn = document.createElement('button');
    helpBtn.classList.add('nx-nav-help');
    helpBtn.innerHTML = '<svg class="icon"><use href="#S2Help20N-icon"/></svg>';

    helpBtn.addEventListener('click', async () => {
      const open = (await import('../modal/modal.js')).default;
      open('/fragments/nav/help');
    });
    return helpBtn;
  }

  async getProfile() {
    const {
      loadIms,
      handleSignIn,
      handleSignOut,
    } = await import('../../utils/ims.js');
    try {
      const details = await loadIms(true);
      if (details.anonymous) return this.renderSignin(handleSignIn);
      // const orgs = await getOrgs();
      details.io = await details.getIo();
      return this.renderProfile(handleSignOut, details);
    } catch {
      return null;
    }
  }

  renderSignin(signIn) {
    const button = document.createElement('button');
    button.textContent = 'Sign in';
    button.className = 'nx-nav-btn nx-nav-btn-sign-in';
    button.addEventListener('click', signIn);
    return button;
  }

  async renderActions() {
    const navActions = document.createElement('div');
    navActions.classList.add('nx-nav-actions');

    const help = await this.renderHelp();
    navActions.append(help);

    const profile = await this.getProfile();
    if (profile) navActions.append(profile);

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
