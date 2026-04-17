import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../../utils/utils.js';
import { pathSegmentsToCrumbs } from './utils.js';

const styles = await loadStyle(import.meta.url);

class NxBreadcrumb extends LitElement {
  static properties = {
    pathSegments: { type: Array, attribute: false },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  render() {
    const crumbs = pathSegmentsToCrumbs(this.pathSegments);
    if (crumbs.length === 0) {
      return nothing;
    }

    return html`
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <ol>
          ${crumbs.map((crumb) => html`
              <li class="crumb">
                ${crumb.href
        ? html`<a class="crumb-label" href=${crumb.href}>${crumb.label}</a>`
        : html`<span class="crumb-label current" aria-current="page">${crumb.label}</span>`}
              </li>
            `)}
        </ol>
      </nav>
    `;
  }
}

customElements.define('nx-breadcrumb', NxBreadcrumb);
