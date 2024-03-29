import { getConfig } from '../../scripts/nexter.js';
import { LitElement, html, nothing } from '../../deps/lit/lit-core.min.js';
import { loadIms, handleSignIn } from '../../utils/ims.js';
import getStyle from '../../utils/styles.js';

import './header/header.js';
import './project/project.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

let imsDetails;

class NxLoc extends LitElement {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
  }

  render() {
    return html`
      <nx-loc-header name=${imsDetails.first_name}></nx-loc-header>
      ${window.location.hash ? html`<nx-loc-project></nx-loc-project>` : nothing}
    `;
  }
}

customElements.define('nx-loc', NxLoc);

export default async function init(el) {
  imsDetails = await loadIms();
  if (!imsDetails.accessToken) {
    handleSignIn();
    return;
  }
  const cmp = document.createElement('nx-loc');
  el.append(cmp);
}
