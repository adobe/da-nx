import { html, LitElement, nothing } from 'da-lit';
import { loadIms } from '../../../nx2/utils/ims.js';
import { loadStyle } from '../../../nx2/utils/utils.js';
import { loadConfig, saveConfig } from './utils.js';

import '../../public/sl/components.js';
import '../shared/path/path.js';

const EL_NAME = 'nx-secure-org';

const styles = await loadStyle(import.meta.url);

class SecureOrg extends LitElement {
  static properties = {
    _org: { state: true },
    _alert: { state: true },
    _user: { state: true },
    _actionText: { state: true },
    _saving: { state: true },
    _authorized: { state: true },
    _existingConfig: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this.resetDefaults();
  }

  resetDefaults() {
    this._user = undefined;
    this._alert = undefined;
    this._saving = undefined;
    this._actionText = 'Update config';
  }

  async handleDetail({ detail }) {
    this.resetDefaults();
    this._org = detail.org;

    if (!this._org) {
      this._alert = {
        type: 'warning',
        message: 'Please enter an org path to check sandbox status.',
      };
      return;
    }

    const user = await loadIms();
    if (user.emailVerified !== 'true') {
      this._alert = {
        type: 'warning',
        message: 'Email has not been verified.',
      };
      return;
    }

    const { message, json } = await loadConfig(this._org);
    if (message) {
      this._alert = { type: 'warning', message };
      return;
    }

    if (json?.permissions) {
      this._alert = { type: 'success', message: 'This org has permissions set.' };
      return;
    }

    if (json) {
      this._existingConfig = json;
    }

    // Set the user if email is verified.
    this._user = user;
  }

  async handleUpdateConfig() {
    this._saving = true;
    this._actionText = 'Updating';
    await saveConfig(this._org, this._user.email, this._existingConfig);
  }

  handleCheck() {
    this._authorized = !this._authorized;
  }

  renderAlert() {
    if (!this._alert) return nothing;

    const type2icon = {
      info: 'infocircle',
      warning: 'alertdiamond',
      success: 'checkmarkcircle',
    };
    const type = this._alert.type || 'info';

    return html`
      <div class="nx-alert ${type}">
        <svg class="icon" viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-${type2icon[type]}-20-n.svg#icon"/></svg>
        <p>${this._alert.message}</p>
      </div>
    `;
  }

  renderPreview() {
    if (!this._user) return nothing;

    return html`
      <p class="nx-detail">Update sandbox</p>
      <h1>${this._org}</h1>
      <div class="config-preview">
        <div class="config-preview-table">
          <div class="table-row">
            <div>Path</div>
            <div>Groups</div>
            <div>Actions</div>
            <div>Comments</div>
          </div>
          <div class="table-row">
            <div>CONFIG</div>
            <div>${this._user.email}</div>
            <div>write</div>
            <div>The ability to set configurations for an org.</div>
          </div>
          <div class="table-row">
            <div>/ + **</div>
            <div>${this._user.email}</div>
            <div>write</div>
            <div>The ability to create content.</div>
          </div>
        </div>
        <div class="config-preview-footer">
          <a class="da-docs" href="https://docs.da.live/administrators/guides/permissions" target="_blank">
            Read permission documentation
          </a>
          <div class="config-preview-action">
            <div>
              <input type="checkbox" id="authorize" name="authorize" @change=${this.handleCheck} ?checked=${this._authorized} />
              <label for="authorize">I am legally authorized to make decisions for this organization.</label>
            </div>
            <sl-button @click=${this.handleUpdateConfig} ?disabled=${this._saving || !this._authorized}>${this._actionText}</sl-button>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <nx-path label="Load organization" @details=${this.handleDetail}></nx-path>
      ${this.renderAlert()}
      ${this.renderPreview()}
    `;
  }
}

customElements.define(EL_NAME, SecureOrg);

export default function init(el) {
  el.replaceChildren();
  let cmp = el.querySelector(EL_NAME);
  if (!cmp) {
    cmp = document.createElement(EL_NAME);
    el.append(cmp);
  }
}
