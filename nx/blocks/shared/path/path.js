import { html, LitElement, nothing } from 'da-lit';
import getStyle from '../../../utils/styles.js';

import '../../../public/sl/components.js';

const styles = await getStyle(import.meta.url);

const DEFAULT_ERROR = 'Not a valid path. Please use /org/site.';

class NxPath extends LitElement {
  static properties = {
    label: { type: String },
    _path: { state: true },
    _error: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];

    // Get the initial path
    this.getDetails();

    // Capture hash changes
    const getDetails = this.getDetails.bind(this);
    window.addEventListener('hashchange', getDetails);
  }

  handleDetails(details) {
    const opts = { detail: details, bubbles: true, composed: true };
    const event = new CustomEvent('details', opts);
    this.dispatchEvent(event);
  }

  getDetails() {
    const path = window.location.hash?.replace('#', '');
    this._path = path;

    if (!path.startsWith('/')) {
      // There's something, but malformed
      if (path) this._error = DEFAULT_ERROR;
      this.handleDetails({});
      return;
    }

    // Clear any existing error
    this._error = undefined;

    const [org, site] = path.substring(1).split('/');
    this.handleDetails({ org, site });
  }

  setPath(e) {
    e.preventDefault();

    const formData = new FormData(e.target.closest('form'));
    const { path } = Object.fromEntries(formData.entries());
    const org = path?.split('/')[1];
    if (!org) {
      this._error = DEFAULT_ERROR;
      return;
    }
    window.location.hash = path;
  }

  render() {
    return html`
      <form class="nx-path-form" @submit=${this.setPath}>
        <sl-input
          type="text"
          name="path"
          placeholder="/geometrixx/outdoors"
          .value="${this._path || ''}"
          error=${this._error || nothing}>
        </sl-input>
        <sl-button class="primary outline" @click=${this.setPath}>${this.label}</sl-button>
      </form>
    `;
  }
}

customElements.define('nx-path', NxPath);
