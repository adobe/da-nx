import getStyle from '../../styles/styles.js';

const style = await getStyle(import.meta.url);

class NxNav extends HTMLElement {
  constructor() {
    super().attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  connectedCallback() {

  }
}

customElements.define('nx-nav', NxNav);

export default function init(el) {
  el.append(document.createElement('nx-nav'));
}
