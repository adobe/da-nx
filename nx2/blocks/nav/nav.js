import { LitElement, html, nothing } from 'da-lit';
import { getMetadata } from '../../scripts/nx.js';

import { loadStyle, HashController } from '../../utils/utils.js';
import { loadFragment } from '../fragment/fragment.js';
import { loadHrefSvg, ICONS_BASE } from '../../utils/svg.js';

const HOME_ICON_HREF = `${ICONS_BASE}S2_Icon_Home_20_N.svg`;

const DEFAULT_NAV_PATH = '/nx/fragments/nav';

const style = await loadStyle(import.meta.url);

/** Resolve against this module so ?nx=local fetches from the Nexter dev origin, not da.live. */
function getBrandLogoHref() {
  return new URL('../../../nx/img/logos/adobe-branding.svg', import.meta.url).href;
}

function normalizeBrandSvg(svg) {
  if (!svg) return;
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
}

/** Hash segments after `#/`: org, site, then path parts → Folder > Folder > Page */
function workspaceBreadcrumbSegments(state) {
  if (!state?.org) return [];
  const segments = [state.org];
  if (state.site) segments.push(state.site);
  if (state.path) {
    segments.push(...state.path.split('/').filter(Boolean));
  }
  return segments;
}

function formatBreadcrumbLabel(raw, isLast) {
  try {
    const decoded = decodeURIComponent(raw);
    if (isLast && decoded.endsWith('.html')) return decoded.slice(0, -5);
    return decoded;
  } catch {
    return raw;
  }
}

/** Chevron between breadcrumb segments; fill uses currentColor (see `.crumb-separator`). */
const BREADCRUMB_CHEVRON = html`
  <svg class="crumb-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none"
    xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="currentColor" d="M7.48254 4.40625L3.85949 0.783199C3.53137 0.455079 3.00011 0.455079 2.67199 0.783199C2.34387 1.11132 2.34387 1.64258 2.67199 1.9707L5.70129 5L2.67199 8.0293C2.34387 8.35742 2.34387 8.88868 2.67199 9.2168C2.83605 9.38086 3.0509 9.46289 3.26574 9.46289C3.48058 9.46289 3.69543 9.38086 3.85949 9.2168L7.48254 5.59375C7.81066 5.26563 7.81066 4.73437 7.48254 4.40625Z" />
  </svg>
`;

class NXNav extends LitElement {
  details = new HashController(this);

  static properties = {
    path: { attribute: false },
    _brand: { state: true },
    _actions: { state: true },
    _homeIcon: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this.loadNav();
  }

  async firstUpdated() {
    const svg = await loadHrefSvg(HOME_ICON_HREF);
    if (svg) {
      svg.setAttribute('width', '20');
      svg.setAttribute('height', '20');
      svg.setAttribute('aria-hidden', 'true');
      this._homeIcon = svg;
    }
  }

  change(props) {
    if (props.has('path') && this.path) {
      this.loadNav();
    }
  }

  async loadNav() {
    const fragment = await loadFragment(this._path);
    if (!fragment) return;
    const sections = [...fragment.querySelectorAll('.section')];
    this._brand = await this.decorateBrand(sections[0]);
    this._actions = await this.decorateActions(sections.pop());
  }

  async decorateBrand(brandSection) {
    const brandLink = brandSection.querySelector('a');
    if (!brandLink) return null;

    brandLink.setAttribute('aria-label', 'Adobe');
    brandLink.textContent = '';

    const graphic = await loadHrefSvg(getBrandLogoHref());
    if (graphic) {
      normalizeBrandSvg(graphic);
      brandLink.append(graphic);
    }

    brandLink.href = '/';

    return brandLink;
  }

  async decorateActions(section) {
    const ul = section.querySelector('ul');
    for (const child of ul.children) {
      const button = child.querySelector('button');
      if (!button) {
        const name = child.textContent.trim();
        await import(`../${name}/${name}.js`);
        const cmp = document.createElement(`nx-${name}`);
        child.replaceChildren(cmp);
      }
    }
    return ul;
  }

  get _path() {
    return getMetadata('nav-path') || this.path || DEFAULT_NAV_PATH;
  }

  async _onHomeClick() {
    const { setPanelsGrid } = await import('../../utils/panel.js');
    if (document.body.classList.contains('sidenav-collapsed')) {
      document.body.classList.remove('sidenav-collapsed');
      sessionStorage.setItem('nx-sidenav-visible', 'true');
    } else {
      document.body.classList.add('sidenav-collapsed');
      sessionStorage.removeItem('nx-sidenav-visible');
    }
    setPanelsGrid();
    this.requestUpdate();
  }

  _renderWorkspaceBreadcrumb() {
    const segments = workspaceBreadcrumbSegments(this.details.value);
    if (segments.length < 2) return nothing;

    return html`
      <nav class="workspace-breadcrumb" aria-label="Location">
        <ol>
          ${segments.flatMap((raw, i) => {
            const isLast = i === segments.length - 1;
            const label = formatBreadcrumbLabel(raw, isLast);
            const hashHref = `#/${segments.slice(0, i + 1).join('/')}`;
            const items = [];
            if (i > 0) {
              items.push(html`
                <li class="crumb-separator" aria-hidden="true">${BREADCRUMB_CHEVRON}</li>
              `);
            }
            items.push(html`
              <li class="crumb">
                ${isLast
                  ? html`<span class="crumb-label current" aria-current="page">${label}</span>`
                  : html`<a class="crumb-label" href="${hashHref}">${label}</a>`}
              </li>
            `);
            return items;
          })}
        </ol>
      </nav>
    `;
  }

  render() {
    return html`
      <div class="brand-area">
        <button
          type="button"
          class="nav-home-btn"
          aria-label="Home"
          aria-expanded=${document.body.classList.contains('sidenav-collapsed') ? 'false' : 'true'}
          @click=${this._onHomeClick}
        >
          ${this._homeIcon ?? nothing}
        </button>
        ${this._brand}
        ${this._renderWorkspaceBreadcrumb()}
      </div>
      <div class="action-area">
        ${this._actions}
      </div>
      `;
  }
}

customElements.define('nx-nav', NXNav);
