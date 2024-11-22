import { getConfig } from '../../scripts/nexter.js';
import { LitElement, html } from '../../deps/lit/lit-core.min.js';
import { loadIms, handleSignIn } from '../../utils/ims.js';
import getStyle from '../../utils/styles.js';

import './header/header.js';
import './project/project.js';
import './setup/setup.js';
import './dashboard/dashboard.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

let imsDetails;

class NxLoc extends LitElement {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
  }

  renderLocType() {
    const { hash } = window.location;
    if (!hash) return html`<nx-loc-setup></nx-loc-setup>`;
    const parts = hash.replace('#/', '').split('/');
    if (parts.length === 2) return html`<nx-loc-dashboard></nx-loc-dashboard>`;
    if (parts.length > 2) return html`<nx-loc-project></nx-loc-project>`;
    return html`<nx-loc-setup></nx-loc-setup>`;
  }

  render() {
    return html`
      <nx-loc-header name=${imsDetails.first_name}></nx-loc-header>
      ${this.renderLocType()}
    `;
  }
}

customElements.define('nx-loc', NxLoc);

export default async function init(el) {
  const isHashPath = (hash) => hash.startsWith('#/');
  try {
    const currentProject = localStorage.getItem('currentProject');
    if (currentProject) {
      localStorage.setItem('prevHash', window.location.hash);
      localStorage.removeItem('currentProject');
      window.location.hash = currentProject;
    }
  } catch (e) {
    console.log(e);
  }

  imsDetails = await loadIms();
  if (!imsDetails.accessToken) {
    handleSignIn();
    return;
  }

  const setup = () => {
    const cmp = el.querySelector('nx-loc');
    if (cmp) cmp.remove();
    el.innerHTML = '<nx-loc></nx-loc>';
  };

  const hashChanged = (e) => {
    const { hash } = new URL(e.newURL);
    if (!isHashPath(hash)) return;
    setup();
  };

  window.addEventListener('hashchange', hashChanged);

  setup();
}
