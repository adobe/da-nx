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
    if (window.location.pathname.startsWith('/app/hannessolo/exp-workspace')) {
      brandLink.innerHTML = `<span>Experience Workspace</span>`;
    }
    brandLink.classList.add('nx-nav-brand');
    brandLink.insertAdjacentHTML('afterbegin', '<svg class="icon"><use href="#spectrum-ExperienceCloud"/></svg>');

    const inner = document.createElement('div');
    inner.className = 'nx-nav-inner';
    inner.append(...sections);
    return inner;
  }

  renderNewUiToggle() {
    const { pathname, search, hash } = window.location;
    const expWorkspacePrefix = '/app/hannessolo/exp-workspace';
    const editPrefix = '/edit';
    const oldBrowsePath = '/'; // old UI browse is at root
    const isNewUi = pathname.startsWith(expWorkspacePrefix);
    const isNewUiSpace = pathname.startsWith(`${expWorkspacePrefix}/space`);
    const isNewUiBrowse = pathname.startsWith(`${expWorkspacePrefix}/browse`);
    const isOldUiEdit = pathname.startsWith(editPrefix);
    const isOldUiBrowse = pathname === '/' || pathname === '';
    const showToggle =
      pathname.startsWith(expWorkspacePrefix) || pathname.startsWith(editPrefix) || isOldUiBrowse;
    if (!showToggle) return null;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.classList.add('nx-nav-new-ui');
    if (isNewUi) btn.classList.add('is-on');
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', isNewUi ? 'true' : 'false');
    btn.setAttribute('aria-label', isNewUi ? 'Switch to classic UI' : 'Switch to new UI');
    const track = document.createElement('span');
    track.classList.add('nx-nav-new-ui-track');
    track.innerHTML = '<span class="nx-nav-new-ui-knob"></span>';
    const label = document.createElement('span');
    label.classList.add('nx-nav-new-ui-label');
    label.textContent = 'New UI';
    btn.append(track, label);

    const NAV_DELAY_MS = 300;

    btn.addEventListener('click', () => {
      const queryAndHash = (search || '') + (hash || '');
      const goingToOldUi = isNewUi;

      // Animate the switch immediately, then navigate after delay
      btn.classList.toggle('is-on', !goingToOldUi);
      btn.setAttribute('aria-checked', goingToOldUi ? 'false' : 'true');
      btn.setAttribute('aria-label', goingToOldUi ? 'Switch to new UI' : 'Switch to classic UI');
      btn.disabled = true;

      setTimeout(() => {
        if (goingToOldUi) {
          // New UI -> Old UI: space -> edit (only if hash has .html), else -> /; browse -> /
          if (isNewUiBrowse) {
            window.location.assign(oldBrowsePath + queryAndHash);
          } else if (isNewUiSpace) {
            const hashHasFile = hash && hash.replace(/^#/, '').trim().toLowerCase().endsWith('.html');
            window.location.assign(hashHasFile ? editPrefix + queryAndHash : oldBrowsePath + queryAndHash);
          } else {
            window.location.assign(oldBrowsePath + queryAndHash);
          }
        } else {
          // Old UI -> New UI: edit -> space, / (browse) -> browse
          const targetPath = isOldUiEdit ? '/space' : '/browse';
          window.location.assign(`${expWorkspacePrefix}${targetPath}${queryAndHash}`);
        }
      }, NAV_DELAY_MS);
    });
    return btn;
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

    const newUiToggle = this.renderNewUiToggle();
    const help = this.renderHelp();
    const profile = this.getProfile();

    const [helpEl, profileEl] = await Promise.all([help, profile]);
    if (newUiToggle) navActions.append(newUiToggle);
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
