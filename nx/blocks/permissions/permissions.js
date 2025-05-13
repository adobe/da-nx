import { html, LitElement, repeat, nothing } from 'da-lit';
import getStyle from '../../utils/styles.js';
import '../../public/sl/components.js';
import {
  getAemConfig,
  getDaUsers,
  combineUsers,
  approveUser,
  clearRequests,
  removeUser,
} from './utils/utils.js';

import './user.js';

const EL_NAME = 'nx-permissions';

const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const styles = await getStyle(import.meta.url);

class NxPermissions extends LitElement {
  static properties = {
    path: { attribute: false },
    _pathError: { state: true },
    _users: { state: true },
    _tokens: { state: true },
    _secrets: { state: true },
    _status: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];
  }

  update(props) {
    if (props.has('path') && this.path) this.getPermissions();
    super.update();
  }

  setPath(e) {
    e.preventDefault();

    const formData = new FormData(e.target.closest('form'));
    const { path } = Object.fromEntries(formData.entries());
    const org = path?.split('/')[1];
    if (!org) {
      this._pathError = 'Please enter a valid path.';
      return;
    }
    window.location.hash = path;
  }

  setStatus(text, description, type = 'info') {
    if (!text) {
      this._status = null;
      return;
    }
    this._status = { type, text, description };
  }

  async getPermissions() {
    this._pathError = undefined;
    if (!this.path) return;

    const loading = [getDaUsers(this.path), getAemConfig(this.path)];
    const [daUsers, aemUsers] = await Promise.all(loading);
    if (aemUsers.error) {
      this._pathError = aemUsers.message;
      this._users = undefined;
      return;
    }

    this._users = combineUsers(daUsers, aemUsers.users);

    this.requestUpdate();
  }

  async handleUserAction(e) {
    this.setStatus('Saving', 'Updating permissions.');

    const { action, user } = e.detail;
    let resp;

    // A DA user request is approved.
    if (action === 'approve') resp = await approveUser(this.path, user);

    // A DA user request is denied.
    if (action === 'deny') resp = await clearRequests(this.path, user);

    // An AEM user needs updating.
    if (action === 'update') resp = await approveUser(this.path, user);

    // An AEM user needs to be removed.
    if (action === 'remove') resp = await removeUser(this.path, user);

    if (resp.status === 200 || resp.status === 201 || resp.status === 204) this.getPermissions();

    this.setStatus();
  }

  renderDaNote() {
    return html`
      <h2>Requests</h2>
      <div class="nx-permission-note">
        <p><strong>Note:</strong> No new permission requests.</p>
        <p><a href="https://da.live/sheet#${this.path}/.da/aem-permission-requests" target="${this.path}/.da/aem-permission-requests">View user list</a>
      </div>
    `;
  }

  renderAemNote() {
    return html`
      <h2>Active</h2>
      <div class="nx-permission-note">
        <p><strong>Note:</strong> No AEM Edge Delivery permissions currently set.</p>
      </div>
    `;
  }

  renderUserGroup(name, title) {
    return html`
      <div class="nx-user-list">
        <h2>${title}</h2>
        <div class="nx-user-list-labels">
          <p>User</p>
          <p>Roles</p>
          <p>${title === 'Requests' ? 'Requested' : nothing}</p>
        </div>
        <ul>
          ${repeat(this._users[name], (user) => user.id, (user) => html`
            <li><nx-permission-user @action=${this.handleUserAction} .user=${user} .type=${title.toLowerCase()}></nx-permission-user></li>
          `)}
        </ul>
        ${name === 'daUsers' ? html`<p class="nx-security-note"><span>Note:</span> Ensure names match user ids before approving requests.</p>` : nothing}
      </div>
    `;
  }

  renderUsers() {
    return html`
      ${this._users.daUsers.length > 0 ? this.renderUserGroup('daUsers', 'Requests') : this.renderDaNote()}
      ${this._users.aemUsers?.length > 0 ? this.renderUserGroup('aemUsers', 'Active') : this.renderAemNote()}
    `;
  }

  renderStatus() {
    return html`
      <div class="nx-status">
        <div class="nx-status-toast nx-status-type-${this._status.type}">
          <p class="nx-status-title">${this._status.text}</p>
          ${this._status.description ? html`<p class="nx-status-description">${this._status.description}</p>` : nothing}
        </div>
      </div>`;
  }

  render() {
    return html`
      <h1>AEM Permissions</h1>
      <form class="nx-site-path" @submit=${this.setPath}>
        <sl-input
          type="text"
          name="path"
          placeholder="/geometrixx/outdoors"
          .value="${this.path || ''}"
          error=${this._pathError || nothing}>
        </sl-input>
        <sl-button class="accent" @click=${this.setPath}>Get Permissions</sl-button>
      </form>
      ${this._users ? this.renderUsers() : nothing}
      ${this._status ? this.renderStatus() : nothing}
    `;
  }
}

customElements.define('nx-permissions', NxPermissions);

function setup(el) {
  let cmp = el.querySelector(EL_NAME);
  if (!cmp) {
    cmp = document.createElement(EL_NAME);
    el.append(cmp);
  }
  cmp.path = window.location.hash?.replace('#', '');
}

export default function init(el) {
  el.innerHTML = '';
  setup(el);
  window.addEventListener('hashchange', () => { setup(el); });
}
