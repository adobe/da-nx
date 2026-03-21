import { LitElement, html, nothing } from 'lit';
import { getConfig, loc } from '../../scripts/nx.js';
import { loadIms, handleSignOut, handleSignIn } from '../../utils/ims.js';
import { DA_ORIGIN, loadStyle, daFetch } from '../../utils/utils.js';

const config = getConfig();

const style = await loadStyle(import.meta.url);
class NxProfile extends LitElement {
  static properties = {
    loginPopup: { type: Boolean },
    _ims: { state: true },
    _avatar: { state: true },
    _openOrgs: { state: true },
    _orgs: { state: true },
  };

  constructor() {
    super();
    this.loadIms();
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  async loadIms() {
    // Attempt to load IMS
    try {
      this._ims = await loadIms(this.loginPopup);
      if (this._ims.anonymous) return;
    } catch {
      config.log('Could not load IMS.');
      return;
    }

    // Attempt to get avatar
    try {
      const { user } = await this._ims.getIo();
      this._avatar = user.avatar;
    } catch {
      config.log('Could not get avatar');
      this._avatar = '/public/icons/S2_Icon_User_20_N.svg';
    }

    this._orgs = (await this._ims.getOrgs()).data;

    this.handleLoaded();
  }

  handleLoaded() {
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('loaded', opts);
    this.dispatchEvent(event);
  }

  handleCopyUser() {
    try {
      const blob = new Blob([this._ims.userId], { type: 'text/plain' });
      const data = [new ClipboardItem({ [blob.type]: blob })];
      navigator.clipboard.write(data);
      this._notice.classList.toggle('is-visible');
      setTimeout(() => { this._notice.classList.toggle('is-visible'); }, 3000);
    } catch {
      config.log('Could not copy to clipboard');
    }
  }

  async handleOrgSwitch(org) {
    await window.adobeIMS.switchProfile(org.userId);
    window.location.reload();
  }

  toggleOpenOrgs() {
    this._openOrgs = !this._openOrgs;
  }

  async handleSignOut() {
    try {
      await daFetch(`${DA_ORIGIN}/logout`);
    } catch {
      // logout did not work.
    }
    handleSignOut();
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('signout', opts);
    this.dispatchEvent(event);
  }

  handleScheme() {
    const { body } = document;

    let currPref = localStorage.getItem('color-scheme');
    if (!currPref) {
      currPref = matchMedia('(prefers-color-scheme: dark)')
        .matches ? 'dark-scheme' : 'light-scheme';
    }

    const theme = currPref === 'dark-scheme'
      ? { add: 'light-scheme', remove: 'dark-scheme' }
      : { add: 'dark-scheme', remove: 'light-scheme' };

    body.classList.remove(theme.remove);
    body.classList.add(theme.add);
    localStorage.setItem('color-scheme', theme.add);
  }

  get _org() {
    return this._orgs?.find((org) => org.userId === this._ims.userId);
  }

  get _notice() {
    return this.shadowRoot.querySelector('.nx-menu-clipboard-notice');
  }

  renderOrg() {
    return html`
      <button class="nx-menu-btn nx-menu-btn-org" @click=${this.toggleOpenOrgs}>
        <p class="nx-org-title">Organization</p>
        <p class="nx-org-name">${this._org.description}</p>
        <svg class="icon" title="Switch organizations"><use href="#S2IconSwitch20N-icon"/></svg>
      </button>
    `;
  }

  renderOrgSwitcher() {
    return html`
      <div class="nx-menu-all-orgs">
        <p class="nx-all-orgs-title">
          Switch Organization
          <button class="nx-all-orgs-cancel" @click=${this.toggleOpenOrgs}>Cancel</button>
        </p>
        <div class="nx-menu-all-orgs-inner">
          ${this._orgs.map((org) => html`
            <button class="nx-orgs-btn-switch" @click=${() => this.handleOrgSwitch(org)}>
              ${org.description}
            </button>
          `)}
        </div>
      </div>
    `;
  }

  renderSignIn() {
    return html`
      <button class="signin-btn" @click=${handleSignIn}>${loc`Sign in`}</button>
    `;
  }

  render() {
    if (!this._ims) return nothing;
    if (this._ims.anonymous) return this.renderSignIn();
    return html`
      <div class="nx-profile">
        <button class="nx-btn-profile" aria-label="Open profile menu" popovertarget="nx-menu-profile">
          <img src="${this._avatar}" alt="" />
        </button>
        <div id="nx-menu-profile" popover>
          <div class="nx-menu-details-wrapper">
            <p class="nx-menu-clipboard-notice">User ID copied to clipboard.</p>
            <button class="nx-menu-btn nx-menu-btn-details" @click=${this.handleCopyUser}>
              <picture>
                <img src="${this._avatar}" alt="Profile photo" />
              </picture>
              <div class="nx-menu-details-name">
                <p class="nx-display-name">${this._ims.displayName}</p>
                <p class="nx-email">${this._ims.email}</p>
              </div>
              <svg class="icon" title="Share profile"><use href="#S2IconShare20N-icon"/></svg>
            </button>
          </div>
          ${this._org && !this._openOrgs ? this.renderOrg() : nothing}
          ${this._openOrgs ? this.renderOrgSwitcher() : nothing}
          <div class="nx-menu-links">
            <p class="nx-menu-link-title">Links</p>
            <ul>
              <li><a href="https://account.adobe.com/" target="_blank">Account</a></li>
              <li><a href="https://experience.adobe.com/#/preferences" target="_blank">Preferences</a></li>
              <li><a href="https://adminconsole.adobe.com" target="_blank">Admin Console</a></li>
            </ul>
          </div>
          <button class="nx-menu-btn nx-menu-btn-signout" @click=${this.handleSignOut}>${loc`Sign out`}</button>
        </div>
      </div>
    `;
  }
}

customElements.define('nx-profile', NxProfile);

export default async function init(a) {
  const cmp = document.createElement('nx-profile');
  a.parentElement.replaceChild(cmp, a);
}
