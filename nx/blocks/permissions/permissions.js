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

  async getPermissions() {
    this._users = undefined;
    this._pathError = undefined;
    if (!this.path) return;

    const loading = [getDaUsers(this.path), getAemConfig(this.path)];
    const [daUsers, aemUsers] = await Promise.all(loading);
    if (aemUsers.error) {
      this._pathError = aemUsers.message;
      return;
    }

    this._users = combineUsers(daUsers, aemUsers.users);

    this.requestUpdate();
  }

  async handleUserAction(e) {
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
  }

  renderUsers(name, title) {
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
      </div>
    `;
  }

  render() {
    return html`
      <h1>AEM Permissions</h1>
      <form class="nx-site-path" @submit=${this.handleSetSite}>
        <sl-input
          type="text"
          name="path"
          placeholder="/geometrixx/outdoors"
          .value="${this.path || ''}"
          error=${this._pathError || nothing}>
        </sl-input>
        <sl-button class="accent" @click=${this.setPath}>Get Permissions</sl-button>
      </form>
      ${this._users?.daUsers.length > 0 ? this.renderUsers('daUsers', 'Requests') : nothing}
      ${this._users?.aemUsers.length > 0 ? this.renderUsers('aemUsers', 'Active') : nothing}
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
