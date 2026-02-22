import { html, LitElement } from 'da-lit';
import getStyle from '../../utils/styles.js';

// Super Lite
import '../../public/sl/components.js';

// Sub-components
import '../profile/profile.js';

// Styles
const styles = await getStyle(import.meta.url);

class NxSidekick extends LitElement {
  static properties = {
    port: { attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
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
    const { page } = data;
    // Setup basic page data
    if (page) {
      this._page = data.page;
      // There are times where IMS fires faster than the post message
      // if (this._ims && !this._ims.anonymous) {}
    }
  }

  async handleProfileLoad(e) {
    // This will have the entire profile or be anon.
    this._ims = e.detail;

    // Do not do anything if anon.
    if (this._ims.anonymous) return;

    if (this._page) {
      // const { ok } = await getIsAllowed(this._page);
      // this._isAllowed = ok;
    }
  }

  handleSignOut() {
    this.port.postMessage({ reload: true });
  }

  render() {
    return html`
      <nx-profile
        loginPopup="true"
        @signout=${this.handleSignOut}
        @loaded=${this.handleProfileLoad}>
      </nx-profile>
    `;
  }
}

customElements.define('nx-sidekick', NxSidekick);

export default async function init(el) {
  el.remove();
  const expCmp = document.createElement('nx-sidekick');
  document.body.append(expCmp);

  window.addEventListener('message', (e) => {
    console.log(e);
    // Setup the port on the web component
    if (e.data && e.data.ready) [expCmp.port] = e.ports;

    // If there's sign in data, tell the top window to reload
    if (e.data?.includes?.('from_ims=true') && expCmp.port) {
      expCmp.port.postMessage({ reload: true });
    }
  });
}
