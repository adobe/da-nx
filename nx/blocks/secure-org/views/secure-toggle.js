import { html, LitElement, nothing } from 'da-lit';
import { loadIms, getOrgs, getAllOrgs } from '../../../utils/ims.js';
import getStyle from '../../../utils/styles.js';

import '../../public/sl/components.js';

const styles = await getStyle(import.meta.url);

class SecureToggle extends LitElement {
  static properties = {
    _alert: { state: true },
    _user: { state: true },
    _orgs: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this.loadDetails();
  }

  async loadDetails() {
    const details = await loadIms();
    if (details.emailVerified !== 'true') {
      this._alert = {
        type: 'warning',
        message: 'Email has not been verified.',
      };
      return;
    }

    // Set the user if email is verified.
    this._user = details;

    const org = await details.getOrgs();
    console.log(org);
  }

  renderAlert() {
    if (!this._alert) return nothing;

    const type2icon = {
      info: 'InfoCircle',
      warning: 'AlertDiamond',
      success: 'CheckmarkCircle',
    };

    return html`
      <div class="nx-alert ${this._alert.type || 'info'}">
        <svg class="icon"><use href="#S2_Icon_${type2icon[this._alert.type || 'info']}_20_N"/></svg>
        <p>${this._alert.message}</p>
      </div>
    `;
  }

  render() {
    return html`
      <div class="demo-wrapper">
        <label for="demo-toggle">Demo content</label>
        <input class="demo-toggle" id="demo-toggle" type="checkbox" .checked="${this._demoContent}" @click="${this.toggleDemo}" />
      </div>

      ${this.renderAlert()}
    `;
  }
}

customElements.define('nx-secure-toggle', SecureToggle);
