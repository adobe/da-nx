import { html, LitElement, repeat, nothing } from 'da-lit';
import getStyle from '../../utils/styles.js';
import { fetchSnapshots, setOrgSite, isRegistered } from './utils/utils.js';

import '../../public/sl/components.js';
import './views/dialog.js';
import './views/snapshot.js';

const EL_NAME = 'nx-snapshot-admin';

// Styles
const nx = `${new URL(import.meta.url).origin}/nx`;
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const styles = await getStyle(import.meta.url);

class NxSnapshotAdmin extends LitElement {
  static properties = {
    sitePath: { attribute: false },
    _error: { state: true },
    _sitePathError: { state: true },
    _snapshots: { state: true },
    _isRegistered: { state: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];
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

    const result = await fetchSnapshots();
    if (result.error) {
      this._error = { heading: 'Note', message: result.error, open: true };
      return;
    }

    this._snapshots = result.snapshots;
    this._isRegistered = await isRegistered(org, site);
  }

  handleSetSite(e) {
    e.preventDefault();
    window.location.hash = this._siteInput.value;
  }

  handleNew() {
    this._snapshots = [{ open: true }, ...this._snapshots];
  }

  handleDelete(idx) {
    this._snapshots.splice(idx, 1);
    this._snapshots = [...this._snapshots];
  }

  handleDialog() {
    this._error = undefined;
  }

  get _siteInput() {
    return this.shadowRoot.querySelector('sl-input[name="site"]');
  }

  renderSnapshots() {
    const count = this._snapshots.filter((snapshot) => snapshot.name).length;
    const s = count === 1 ? '' : 's';

    return html`
      <hr/>
      <div class="nx-snapshot-list-header">
        <h2>${count} snapshot${s}</h2>
        <sl-button @click=${this.handleNew}>Add new</sl-button>
      </div>
      <div class="nx-snapshot-list-labels">
        <p>Name</p>
        <p>Review</p>
      </div>
      ${this._snapshots ? html`
        <div class="nx-snapshot-list">
          <ul>
            ${repeat(this._snapshots, (snapshot) => snapshot.name, (snapshot, idx) => html`
              <li><nx-snapshot @delete=${() => this.handleDelete(idx)} .basics=${snapshot} .isRegistered=${this._isRegistered}></nx-snapshot></li>
            `)}
          </ul>
        </div>
      ` : nothing}
    `;
  }

  render() {
    return html`
      <h1>Snapshots</h1>
      <form class="nx-site-path" @submit=${this.handleSetSite}>
        <sl-input
          type="text"
          name="site"
          placeholder="/my-org/my-site"
          .value="${this.sitePath || ''}"
          error=${this._sitePathError || nothing}>
        </sl-input>
        <sl-button class="primary outline" @click=${this.handleSetSite}>Get Snapshots</sl-button>
      </form>
      ${this._snapshots ? this.renderSnapshots() : nothing}
      <nx-dialog @action=${this.handleDialog} .details=${this._error}></nx-dialog>
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
