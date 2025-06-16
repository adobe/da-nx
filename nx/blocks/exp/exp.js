// eslint-disable-next-line import/no-unresolved
import { html, LitElement, nothing } from 'da-lit';
import { loadStyle } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';
import { getIsAllowed, processDetails, getStrings } from './utils.js';

// Super Lite
import '../../public/sl/components.js';

// Sub-components
import './views/new.js';
import './views/view.js';
import './views/edit.js';
import './views/login.js';
import './views/dialog.js';
import './views/actions.js';
import '../profile/profile.js';

// NX Base
const nx = `${new URL(import.meta.url).origin}/nx`;

// Styles
await loadStyle(`${nx}/public/sl/styles.css`);
const sl = await getStyle(`${nx}/public/sl/styles.css`);
const styles = await getStyle(import.meta.url);

class NxExp extends LitElement {
  static properties = {
    port: { attribute: false },
    _ims: { state: true },
    _edit: { state: true },
    _page: { state: true },
    _details: { state: true },
    _isAllowed: { state: true },
    _isEdit: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sl, styles];
  }

  update(props) {
    if (props.has('port') && this.port) {
      // Post a message saying this side is ready.
      this.port.postMessage({ ready: true });
      // Wait for more messages from the other side.
      this.port.onmessage = (e) => { this.handleMessage(e); };
    }
    super.update();
  }

  async handleMessage({ data }) {
    const { page, experiment } = data;
    // Setup basic page data
    if (page) {
      this._page = data.page;
      // There are times where IMS fires faster than the post message
      if (this._ims && !this._ims.anonymous) {
        const { ok } = await getIsAllowed(this._page);
        this._isAllowed = ok;
      }
    }
    // Format raw exp data into details
    if (experiment) this._details = processDetails(experiment);
  }

  async handleProfileLoad(e) {
    // This will have the entire profile or be anon.
    this._ims = e.detail;

    // Do not do anything if anon.
    if (this._ims.anonymous) return;

    if (this._page) {
      const { ok } = await getIsAllowed(this._page);
      this._isAllowed = ok;
    }
  }

  handleSignOut() {
    this.port.postMessage({ reload: true });
  }

  handleAction({ detail }) {
    if (detail.action === 'edit') this._isEdit = true;

    if (detail.action === 'cancel') {
      // If there's no name, destroy the details object
      if (!this._details.name) this._details = undefined;
      this._isEdit = false;
    }

    if (detail.action === 'new') {
      this._details = detail.details;
      this._isEdit = true;
    }

    if (detail.action === 'saved') {
      this.port.postMessage({ reload: true });
    }

    if (detail.action === 'preview') {
      this.port.postMessage({ preview: detail.param });
    }
  }

  renderReady() {
    // Do nothing until we have some value.
    if (this._isAllowed === undefined) return nothing;

    if (this._isAllowed) {
      // If someone set the view to edit, use it.
      if (this._isEdit && this._details) {
        return html`
          <nx-exp-edit
            .page=${this._page}
            .details=${this._details}
            @action=${this.handleAction}>
          </nx-exp-edit>`;
      }

      // Default to the view screen if there are details.
      if (this._details) {
        return html`
          <nx-exp-view
            .page=${this._page}
            .strings=${this.strings}
            .details=${this._details}
            @action=${this.handleAction}>
          </nx-exp-view>`;
      }

      // Show new if not edit or no details
      if (!this._details) {
        return html`
          <nx-exp-new
            .page=${this._page}
            .strings=${this.strings}
            @action=${this.handleAction}>
          </nx-exp-new>`;
      }
    }

    // If not allowed show the switch profile screen.
    return html`<h1>Not allowed.</h1>`;
  }

  render() {
    return html`
      <div class="nx-exp-header">
        <div class="drag-handle">
          <img src="${nx}/blocks/exp/img/handle.svg" alt="" />
        </div>
        <h1>Experimentation</h1>
        <nx-profile
          loginPopup="true"
          @signout=${this.handleSignOut}
          @loaded=${this.handleProfileLoad}>
        </nx-profile>
      </div>
      ${this._ims?.anonymous ? html`<nx-exp-login .strings=${this.strings}></nx-exp-login>` : this.renderReady()}
    `;
  }
}

customElements.define('nx-exp', NxExp);

export default async function init(el) {
  const expCmp = document.createElement('nx-exp');
  expCmp.strings = getStrings(el);
  document.body.append(expCmp);
  el.remove();

  window.addEventListener('message', (e) => {
    // Setup the port on the web component
    if (e.data && e.data.ready) [expCmp.port] = e.ports;

    // If there's sign in data, tell the top window to reload
    if (e.data?.includes?.('from_ims=true') && expCmp.port) {
      expCmp.port.postMessage({ reload: true });
    }
  });
}
