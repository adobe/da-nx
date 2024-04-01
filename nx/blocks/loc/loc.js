import { getConfig } from '../../scripts/nexter.js';
import { LitElement, html, nothing } from '../../deps/lit/lit-core.min.js';
import { loadIms, handleSignIn } from '../../utils/ims.js';
import getStyle from '../../utils/styles.js';

import './header/header.js';
import './project/project.js';
import './setup/setup.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

let imsDetails;

class NxLoc extends LitElement {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
  }

  get isHashProject() {
    return window.location.hash.startsWith('#/');
  }

  render() {
    return html`
      <nx-loc-header name=${imsDetails.first_name}></nx-loc-header>
      ${this.isHashProject ? html`<nx-loc-project></nx-loc-project>` : html`<nx-loc-setup></nx-loc-setup>`}
    `;
  }
}

customElements.define('nx-loc', NxLoc);

export default async function init(el) {
  const isHashPath = (hash) => hash.startsWith('#/');

  imsDetails = await loadIms();
  if (!imsDetails.accessToken) {
    handleSignIn();
    return;
  }

  const setup = () => {
    let cmp = el.querySelector('nx-loc');
    if (cmp) cmp.remove();
    cmp = document.createElement('nx-loc');
    el.append(cmp);
  };

  const hashChanged = (e) => {
    const { hash } = new URL(e.newURL);
    if (!isHashPath(hash)) return;
    setup();
  };

  if (!isHashPath(window.location.hash)) {
    window.addEventListener('hashchange', hashChanged);
  }

  setup();
}
