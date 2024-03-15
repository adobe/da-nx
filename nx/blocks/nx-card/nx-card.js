import getStyle from '../../scripts/styles.js';
const style = await getStyle(import.meta.url);

class NxCard extends HTMLElement {
  constructor() {
    super().attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = '<div class="stuff">Hi</div>';
  }

}

customElements.define('nx-card', NxCard);

export default function init(el) {
  const nav = document.createElement('nx-card');
  el.append(nav);
}
