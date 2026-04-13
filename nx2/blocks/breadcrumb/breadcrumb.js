import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { loadHrefSvg } from '../../utils/svg.js';
import { pathSegmentsToCrumbs } from './utils.js';

const styles = await loadStyle(import.meta.url);

const CHEVRON_HREF = new URL('../../img/icons/S2_Icon_ChevronRight_20_N.svg', import.meta.url).href;

class NxBreadcrumb extends LitElement {
  static properties = {
    pathSegments: { type: Array, attribute: false },
    _chevronSvg: { state: true },
  };

  constructor() {
    super();
    this.pathSegments = undefined;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  async firstUpdated() {
    const svg = await loadHrefSvg(CHEVRON_HREF);
    if (svg) {
      svg.classList.add('crumb-chevron');
      svg.setAttribute('aria-hidden', 'true');
    }
    this._chevronSvg = svg;
    this.requestUpdate();
  }

  render() {
    const crumbs = pathSegmentsToCrumbs(this.pathSegments);
    if (crumbs.length === 0) {
      return nothing;
    }

    return html`
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <ol>
          ${crumbs.map((crumb, i) => html`
              <li class="crumb">
                ${i > 0
                  ? html`
                      <span class="crumb-separator" aria-hidden="true">
                        ${this._chevronSvg
                          ? this._chevronSvg.cloneNode(true)
                          : html`<span class="crumb-chevron-fallback" aria-hidden="true">›</span>`}
                      </span>
                    `
                  : nothing}
                ${crumb.href
                  ? html`<a class="crumb-label" href=${crumb.href}>${crumb.label}</a>`
                  : html`
                      <span class="crumb-label current" aria-current="page">${crumb.label}</span>
                    `}
              </li>
            `)}
        </ol>
      </nav>
    `;
  }
}

if (!customElements.get('nx-breadcrumb')) {
  customElements.define('nx-breadcrumb', NxBreadcrumb);
}
