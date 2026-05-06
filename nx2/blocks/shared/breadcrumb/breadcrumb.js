import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { pathSegmentsToCrumbs } from './utils.js';

const style = await loadStyle(import.meta.url);
const CHEVRON_URL = new URL('../../../img/icons/S2_Icon_ChevronLeft_10_N.svg', import.meta.url).href;

export default class NxBreadcrumb extends LitElement {
  static properties = {
    pathSegments: { type: Array, attribute: false },
    baseUrl: { type: String, attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.style.setProperty('--nx-crumb-sep', `url("${CHEVRON_URL}")`);
  }

  render() {
    const crumbs = pathSegmentsToCrumbs(this.pathSegments, { baseUrl: this.baseUrl });
    if (!crumbs.length) return nothing;

    return html`
      <nav class="nx-breadcrumb" aria-label="Breadcrumb">
        <ol>
          ${crumbs.map((c, i) => html`
            <li class="crumb">
              ${i === crumbs.length - 1
                ? html`<span class="current" aria-current="page">${c.label}</span>`
                : html`<a href=${c.href}>${c.label}</a>`}
            </li>
          `)}
        </ol>
      </nav>
    `;
  }
}

customElements.define('nx-breadcrumb', NxBreadcrumb);
