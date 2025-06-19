import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';
import getSvg from '../../utils/svg.js';
import { daFetch } from '../../utils/daFetch.js';
import { DA_ORIGIN } from '../../public/utils/constants.js';
import { loadIms, handleSignIn, handleSignOut } from '../../utils/ims.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);

const ICONS = [
  `${nxBase}/img/icons/S2IconShare20N-icon.svg`,
  `${nxBase}/img/icons/S2IconSwitch20N-icon.svg`,
];

class NxProfile extends LitElement {
  static properties = {
    loginPopup: { type: Boolean },
    _signedIn: { state: true },
    _details: { state: true },
    _avatar: { state: true },
    _org: { state: true },
    _orgs: { state: true },
  };

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    await this.getDetails();
    this.handleLoaded();
  }

  setIcons() {
    getSvg({ parent: this.shadowRoot, paths: ICONS });
  }

  async getDetails() {
    try {
      this._details = await loadIms(this.loginPopup);
      if (this._details.anonymous) {
        this._signedIn = false;
        return;
      }
      try {
        const { user } = await this._details.getIo();
        this._avatar = user.avatar;
      } catch {
        console.log('Could not get avatar');
        this._avatar = `${nxBase}/public/icons/S2_Icon_User_20_N.svg`;
      }
      this._signedIn = true;
      this.getOrg();
      this.setIcons();
    } catch {
      this._signedIn = false;
    }
  }

  async getOrg() {
    const orgs = await this._details.getOrgs();
    [this._org] = Object.keys(orgs);
  }

  async getAllOrgs() {
    this._orgs = await this._details.getAllOrgs();
  }

  handleLoaded() {
    this.dataset.loaded = true;
    const opts = { detail: this._details, bubbles: true, composed: true };
    const event = new CustomEvent('loaded', opts);
    this.dispatchEvent(event);
  }

  handleCopyUser() {
    try {
      const blob = new Blob([this._details.userId], { type: 'text/plain' });
      const data = [new ClipboardItem({ [blob.type]: blob })];
      navigator.clipboard.write(data);
      this._notice.classList.toggle('is-visible');
      setTimeout(() => { this._notice.classList.toggle('is-visible'); }, 3000);
    } catch {
      console.log('Could not copy to clipboard');
    }
  }

  async handleOrgSwitch(org) {
    await window.adobeIMS.switchProfile(org.entitlement_user_id);
    window.location.reload();
  }

  handleOrgCancel() {
    this._orgs = undefined;
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

  get _notice() {
    return this.shadowRoot.querySelector('.nx-menu-clipboard-notice');
  }

  renderSignIn() {
    return html`
      <button class="nx-btn-signin" @click=${handleSignIn}>Sign in</button>
    `;
  }

  renderOrg() {
    return html`
      <button class="nx-menu-btn nx-menu-btn-org" @click=${this.getAllOrgs}>
        <p class="nx-org-title">Organization</p>
        <p class="nx-org-name">${this._org}</p>
        <svg class="icon" title="Switch organizations"><use href="#S2IconSwitch20N-icon"/></svg>
      </button>
    `;
  }

  renderOrgs() {
    return html`
      <div class="nx-menu-all-orgs">
        <p class="nx-all-orgs-title">
          Switch Organization
          <button class="nx-all-orgs-cancel" @click=${this.handleOrgCancel}>Cancel</button>
        </p>
        ${this._orgs.map((org) => html`
          <button class="nx-orgs-btn-switch" @click=${() => this.handleOrgSwitch(org)}>
            ${org.organization_name}
          </button>
        `)}
      </div>
    `;
  }

  render() {
    if (this._signedIn === undefined) return nothing;
    if (this._signedIn === false) return this.renderSignIn();
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
                <p class="nx-display-name">${this._details.displayName}</p>
                <p class="nx-email">${this._details.email}</p>
              </div>
              <svg class="icon" title="Share profile"><use href="#S2IconShare20N-icon"/></svg>
            </button>
          </div>
          ${this._org && !this._orgs ? this.renderOrg() : nothing}
          ${this._orgs ? this.renderOrgs() : nothing}
          <div class="nx-menu-links">
            <p class="nx-menu-link-title">Links</p>
            <ul>
              <li><a href="https://account.adobe.com/" target="_blank">Account</a></li>
              <li><a href="https://experience.adobe.com/#/preferences" target="_blank">Preferences</a></li>
              <li><a href="https://adminconsole.adobe.com" target="_blank">Admin Console</a></li>
            </ul>
          </div>
          <button class="nx-menu-btn nx-menu-btn-signout" @click=${this.handleSignOut}>Sign out</button>
        </div>
      </div>
    `;
  }
}

customElements.define('nx-profile', NxProfile);
