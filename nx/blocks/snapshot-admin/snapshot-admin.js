import { html, LitElement, repeat, nothing } from 'da-lit';
import getStyle from '../../../nx2/public/utils/styles.js';
import { fetchSnapshots, setOrgSite, isRegistered, getUserPublishPermission, fetchLaunchPermission } from './utils/utils.js';

import './views/dialog.js';
import './views/snapshot.js';

const EL_NAME = 'nx-snapshot-admin';

// Styles
const [buttons, form, styles] = await Promise.all([
  getStyle(new URL('../../../nx2/styles/buttons.css', import.meta.url).href),
  getStyle(new URL('../../../nx2/styles/form.css', import.meta.url).href),
  getStyle(import.meta.url),
]);

class NxSnapshotAdmin extends LitElement {
  static properties = {
    sitePath: { attribute: false },
    _error: { state: true },
    _sitePathError: { state: true },
    _snapshots: { state: true },
    _loading: { state: true },
    _isRegistered: { state: false },
    _userPermissions: { state: true },
    _hasLaunchPermission: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [buttons, form, styles];
    this.getSnapshots();
  }

  update(props) {
    if (props.has('sitePath') && this.sitePath) this.getSnapshots();
    super.update();
  }

  async getSnapshots() {
    this._sitePathError = undefined;
    if (!this.sitePath) return;

    const [org, site] = this.sitePath?.split('/').slice(1, 3) || [];

    if (!(org && site)) {
      this._sitePathError = 'Please enter a valid site path.';
      return;
    }

    // Set org and site on the module for future use
    setOrgSite(org, site);

    this._loading = true;
    const result = await fetchSnapshots()
      .catch((e) => ({ error: e.message || 'Could not load snapshots.' }))
      .finally(() => { this._loading = false; });
    if (result.error) {
      this._error = { heading: 'Note', message: result.error, open: true };
      return;
    }

    this._snapshots = result.snapshots;
    this._isRegistered = await isRegistered(org, site);
    this._userPermissions = await getUserPublishPermission();
    this._hasLaunchPermission = await fetchLaunchPermission();
  }

  handleSetSite(e) {
    e.preventDefault();
    window.location.hash = this._siteInput.value;
  }

  handleNew() {
    this._snapshots = [{ open: true }, ...this._snapshots];
  }

  handleDelete(snapshot) {
    const idx = this._snapshots.findIndex((s) => s.name === snapshot.name);
    if (idx > -1) {
      this._snapshots.splice(idx, 1);
      this._snapshots = [...this._snapshots];
    }
  }

  handleClearFilter() {
    const url = new URL(window.location);
    url.searchParams.delete('snapshot');
    window.history.replaceState({}, '', url);
    this._snapshots.forEach((s) => { s.open = false; });
    this.requestUpdate();
  }

  handleDialog() {
    this._error = undefined;
  }

  get _siteInput() {
    return this.shadowRoot.querySelector('input[name="site"]');
  }

  renderSnapshots() {
    const filterName = new URLSearchParams(window.location.search).get('snapshot');
    const snapshots = filterName
      ? this._snapshots.filter((s) => s.name?.toLowerCase() === filterName.toLowerCase())
      : this._snapshots;
    const count = snapshots.filter((snapshot) => snapshot.name).length;
    const s = count === 1 ? '' : 's';

    return html`
      <div class="nx-snapshot-list-header">
        <h2>${count} snapshot${s}</h2>
        ${filterName ? html`<button type="button" class="nx-action-btn nx-snapshot-see-all" @click=${this.handleClearFilter}>See All</button>` : nothing}
        ${filterName ? nothing : html`<button type="button" class="nx-btn-accent" @click=${this.handleNew}>Add new</button>`}
      </div>
      ${count === 0 && !filterName ? html`<p class="nx-snapshot-empty">No snapshots yet. Select <b>Add new</b> to capture a set of pages.</p>` : nothing}
      ${snapshots ? html`
        <div class="nx-snapshot-list">
          <ul>
            ${repeat(
              snapshots,
              (snap) => snap.name,
              (snap) => html`
              <li><nx-snapshot @delete=${() => this.handleDelete(snap)} .basics=${snap} .isRegistered=${this._isRegistered} .userPermissions=${this._userPermissions} .hasLaunchPermission=${this._hasLaunchPermission} .startOpen=${!!filterName}></nx-snapshot></li>`,
            )}
          </ul>
        </div>
      ` : nothing}
    `;
  }

  render() {
    return html`
      <div class="nx-snapshot-admin-header">
        <h1>Snapshots</h1>
        <p>Capture, review and publish a set of pages together.</p>
      </div>
      <form class="nx-site-path nx-form-field ${this._sitePathError ? 'nx-field-error' : ''}" @submit=${this.handleSetSite}>
        <label for="snapshot-site">Site</label>
        <div class="nx-site-path-row">
          <input
            id="snapshot-site"
            class="nx-input"
            type="text"
            name="site"
            placeholder="/my-org/my-site"
            aria-invalid=${this._sitePathError ? 'true' : 'false'}
            .value=${this.sitePath || ''}>
          <button type="submit" class="nx-btn-primary">Get Snapshots</button>
        </div>
        ${this._sitePathError ? html`<p class="nx-input-error-msg">${this._sitePathError}</p>` : nothing}
      </form>
      ${this._loading ? html`<p class="nx-snapshot-loading" role="status">Loading snapshots…</p>` : nothing}
      ${this._snapshots && !this._loading ? this.renderSnapshots() : nothing}
      <nx-snapshot-dialog @action=${this.handleDialog} .details=${this._error}></nx-snapshot-dialog>
    `;
  }
}

customElements.define(EL_NAME, NxSnapshotAdmin);

function setupSnapshots(el) {
  let cmp = document.querySelector(EL_NAME);
  if (!cmp) {
    cmp = document.createElement(EL_NAME);
    el.append(cmp);
  }

  cmp.sitePath = window.location.hash?.replace('#', '');
}

export default function init(el) {
  el.innerHTML = '';
  setupSnapshots(el);
  window.addEventListener('hashchange', (e) => {
    setupSnapshots(el, e);
  });
}
