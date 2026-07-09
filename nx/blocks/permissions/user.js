import { html, LitElement, nothing } from 'da-lit';
import getStyle from '../../../nx2/public/utils/styles.js';
import { getConfig } from '../../../nx2/scripts/nx.js';
import '../../../nx2/public/sl/components.js';

const { nxBase, codeBase } = getConfig();
const sl = await getStyle(`${nxBase}/public/sl/styles.css`);
const styles = await getStyle(import.meta.url);

const ADD_ICON = `${codeBase}/img/icons/s2-icon-add-20-n.svg#icon`;
const CHECKMARK_ICON = `${codeBase}/img/icons/s2-icon-checkmark-20-n.svg#icon`;
const CLOSE_ICON = `${codeBase}/img/icons/s2-icon-close-20-n.svg#icon`;

class NxPermissionUser extends LitElement {
  static properties = {
    user: { attribute: false },
    type: { attribute: false },
    _roles: { state: true },
    _requested: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];
  }

  update(props) {
    if (props.has('user') && this.user) this.formatRoles();
    super.update();
  }

  formatRoles() {
    const mapRoles = (roles, active = true) => roles.map((role) => ({ name: role, active }));

    const { requested = [], roles = [] } = this.user;

    // Determine if user has _any_ roles or requests
    const populated = requested.length > 0 || roles.length > 0;

    if (!populated) requested.push('admin', 'author', 'publish');

    this._requested = mapRoles(requested, populated);
    this._roles = mapRoles(roles);
  }

  filterActiveRoles(roles) {
    return roles.reduce((acc, request) => {
      if (request.active) acc.push(request.name);
      return acc;
    }, []);
  }

  handleAction(actionTitle) {
    const action = actionTitle.toLowerCase();

    // Filter down to only active requested roles
    if (this._requested) this.user.requested = this.filterActiveRoles(this._requested);

    // Filter down to only active roles
    if (this._roles) this.user.roles = this.filterActiveRoles(this._roles);

    const opts = { detail: { action, user: this.user }, bubbles: true, composed: true };
    const event = new CustomEvent('action', opts);
    this.dispatchEvent(event);
  }

  handleRoleToggle(name) {
    // Attempt to find in the requested role list
    if (this._requested) {
      const found = this._requested.find((role) => name === role.name);
      if (found) found.active = !found.active;
    }
    // Attempt to find in the current role list
    if (this._roles) {
      const found = this._roles.find((role) => name === role.name);
      if (found) found.active = !found.active;
    }
    this.requestUpdate();
  }

  renderRoles(roles) {
    return roles.map((role) => html`
    <button class="nx-role-tag ${role.active ? 'is-active' : ''}" @click=${() => this.handleRoleToggle(role.name)}>
      ${role.name}<svg viewBox="0 0 20 20" aria-hidden="true"><use href="${role.active ? CLOSE_ICON : ADD_ICON}"></use></svg>
    </button>`);
  }

  renderButtons(positiveAction, negativeAction) {
    return html`
      <button class="deny-request" @click=${() => this.handleAction(negativeAction)}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><use href="${CLOSE_ICON}"></use></svg>${negativeAction}
      </button>
      <button class="approve-request" @click=${() => this.handleAction(positiveAction)}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><use href="${CHECKMARK_ICON}"></use></svg>${positiveAction}
      </button>
    `;
  }

  render() {
    return html`
      <div class="nx-user-wrapper">
        <p class="nx-user-name">
          <strong>${this.user.displayName || this.user.email}</strong>
          <span>${this.user.email}</span>
        </p>
        <div class="nx-roles role">${this._roles?.length ? this.renderRoles(this._roles) : nothing}</div>
        <div class="nx-roles requested">${this._requested?.length ? this.renderRoles(this._requested) : nothing}</div>
        <div class="nx-user-approve">
          ${this.type === 'requests' ? this.renderButtons('Approve', 'Deny') : this.renderButtons('Update', 'Remove')}
        </div>
      </div>
    `;
  }
}

customElements.define('nx-permission-user', NxPermissionUser);
