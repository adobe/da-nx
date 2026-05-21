import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { getConfig } from '../../../scripts/nx.js';
import { pathSegmentsToCrumbs } from './utils.js';

const style = await loadStyle(import.meta.url);
const { codeBase } = getConfig();
const CRUMB_SEP = html`<svg class="crumb-sep" viewBox="0 0 10 10" aria-hidden="true"><use href="${codeBase}/img/icons/s2-icon-chevronleft-10-n.svg#icon"></use></svg>`;

export default class NxBreadcrumb extends LitElement {
  static properties = {
    pathSegments: { type: Array, attribute: false },
    baseUrl: { type: String, attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  render() {
    const crumbs = pathSegmentsToCrumbs(this.pathSegments, { baseUrl: this.baseUrl });
    if (!crumbs.length) return nothing;

    return html`
      <nav class="nx-breadcrumb" aria-label="Breadcrumb">
        <ol>
          ${crumbs.map((c, i) => html`
            <li class="crumb">
              ${i > 0 ? CRUMB_SEP : nothing}
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

if (!customElements.get('nx-breadcrumb')) customElements.define('nx-breadcrumb', NxBreadcrumb);
