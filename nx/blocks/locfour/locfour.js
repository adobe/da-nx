import { LitElement, html } from '../../deps/lit/lit-core.min.js';
import { getConfig } from '../../scripts/nexter.js';
import getStyle from '../../utils/styles.js';

const { nxBase } = getConfig();
const style = await getStyle(import.meta.url);
const buttons = await getStyle(`${nxBase}/styles/buttons.js`);

class NxLoc extends LitElement {
  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, buttons];
  }

  render() {
    return html`
      <h1>Loc</h1>
    `;
  }
}

customElements.define('nx-loc', NxLoc);

export default function init(el) {
  el.innerHTML = '<nx-loc></nx-loc>';
}
