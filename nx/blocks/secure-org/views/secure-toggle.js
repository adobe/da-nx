import { html, LitElement, nothing } from 'da-lit';
import { loadIms, getOrgs, getAllOrgs } from '../../../utils/ims.js';
import getStyle from '../../../utils/styles.js';

import '../../../public/sl/components.js';

const styles = await getStyle(import.meta.url);

class SecureToggle extends LitElement {
  static properties = {
    title: { state: true },
    _user: { state: true },
    _org: { state: true },
    _type: { state: true },
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

    this._user = details;

    const org = await details.getOrgs();

    this._org = {
      name: Object.keys(org)[0],
      id: Object.values(org)[0].orgRef.ident,
    };
  }

  handleToggle(type) {
    this._type = type;
  }

  handleCheck({ target }) {
    const type = target.checked ? 'org' : 'email';
    this.handleToggle(type);
  }

  get groups() {
    return this._type === 'org' ? this._org.id : this._user.email;
  }

  render() {
    if (!this._user) return nothing;

    return html`
      <div class="toggle-wrapper">
        <div class="toggle-inner">
          <button
            @click=${() => this.handleToggle('email')}
            class="toggle-label toggle-label-email ${this._type === 'org' ? '' : 'is-active'}">
            <p>Email</p>
            <p>${this._user.email}</p>
          </button>
          <input class="demo-toggle" id="demo-toggle" type="checkbox" @click="${this.handleCheck}" ?checked=${this._type === 'org'} />
          <button
            @click=${() => this.handleToggle('org')}
            class="toggle-label toggle-label-org ${this._type === 'org' ? 'is-active' : ''}">
            <p>Organization</p>
            <p>${this._org.name}</p>
          </button>
        </div>
      </div>
      <div class="config-preview-table">
        <div class="table-row">
          <div>Path</div>
          <div>Groups</div>
          <div>Actions</div>
        </div>
        <div class="table-row">
          <div>CONFIG</div>
          <div>${this.groups}</div>
          <div>write</div>
        </div>
        <div class="table-row">
          <div>/ + **</div>
          <div>${this.groups}</div>
          <div>write</div>
        </div>
      </div>
    `;
  }
}

customElements.define('nx-secure-toggle', SecureToggle);
