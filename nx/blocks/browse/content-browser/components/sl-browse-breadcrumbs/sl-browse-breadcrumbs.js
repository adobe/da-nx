// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html, nothing } from 'da-lit';

const style = await getStyle(import.meta.url);

/**
 * Default for `visible-path-tail-count` (kept for API compatibility; custom trail is scrollable).
 */
const DEFAULT_VISIBLE_PATH_TAIL_COUNT = 3;

/**
 * Builds breadcrumb rows from path segments (first two collapse to one crumb so `#/` stays valid).
 * @param {string[]} pathSegments - Path segments (e.g. from URL); may be empty.
 * @returns {{ label: string, value: string }[]} Crumb `value` is the path key to navigate to.
 */
export function buildBreadcrumbItemsFromPathSegments(pathSegments) {
  const segments = (pathSegments || []).filter(Boolean);
  if (segments.length === 0) return [];
  if (segments.length === 1) {
    return [{ label: segments[0], value: segments[0] }];
  }
  /** @type {{ label: string, value: string }[]} */
  const crumbItems = [];
  crumbItems.push({
    label: `${segments[0]} / ${segments[1]}`,
    value: segments.slice(0, 2).join('/'),
  });
  for (let segmentIndex = 2; segmentIndex < segments.length; segmentIndex += 1) {
    crumbItems.push({
      label: segments[segmentIndex],
      value: segments.slice(0, segmentIndex + 1).join('/'),
    });
  }
  return crumbItems;
}

/**
 * Folder-path breadcrumbs; dispatches `sl-browse-navigate` when a segment is activated.
 * Implemented without Spectrum `sp-breadcrumbs` to avoid `adjustOverflow` / overflow-menu crashes.
 * @fires sl-browse-navigate - detail: { pathKey: string }
 * @customElement sl-browse-breadcrumbs
 */
export class SlBrowseBreadcrumbs extends LitElement {
  static properties = {
    /** Path segments under org/site (e.g. `['org','site','folder']`). */
    segments: { type: Array },
    /** @deprecated No longer affects rendering; trail scrolls horizontally when long. */
    visiblePathTailCount: { type: Number, attribute: 'visible-path-tail-count' },
  };

  constructor() {
    super();
    this.segments = [];
    this.visiblePathTailCount = DEFAULT_VISIBLE_PATH_TAIL_COUNT;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  /**
   * Dispatches navigation when the user picks a crumb (host updates location / state).
   * @param {string} pathKey - Target path key (e.g. org/site/folder, no leading slash).
   */
  emitNavigateEvent(pathKey) {
    this.dispatchEvent(
      new CustomEvent('sl-browse-navigate', {
        detail: { pathKey },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    const crumbItems = buildBreadcrumbItemsFromPathSegments(this.segments);
    return html`
      <div class="sl-crumb-bar">
        <nav class="sl-crumb-nav" aria-label="Folder path">
          ${crumbItems.length === 0
            ? html`<span class="sl-crumb-current">Browse</span>`
            : crumbItems.map((crumb, crumbIndex) => {
                const isLast = crumbIndex === crumbItems.length - 1;
                const sep = crumbIndex > 0
                  ? html`<span class="sl-crumb-sep" aria-hidden="true">›</span>`
                  : nothing;
                const segment = isLast
                  ? html`
                      <span class="sl-crumb-current" title="${crumb.label}">${crumb.label}</span>
                    `
                  : html`
                      <button
                        type="button"
                        class="sl-crumb-btn"
                        title="${crumb.label}"
                        @click=${() => this.emitNavigateEvent(crumb.value)}
                      >
                        ${crumb.label}
                      </button>
                    `;
                return html`${sep}${segment}`;
              })}
        </nav>
      </div>
    `;
  }
}

if (!customElements.get('sl-browse-breadcrumbs')) {
  customElements.define('sl-browse-breadcrumbs', SlBrowseBreadcrumbs);
}
