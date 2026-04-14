// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';

const style = await getStyle(import.meta.url);

/**
 * Screen-reader label for the ellipsis overflow menu (hidden middle path segments).
 */
const BREADCRUMB_OVERFLOW_MENU_LABEL = 'Hidden path';

/**
 * Default count of trailing crumbs shown after the root when the path is long (Spectrum
 * `max-visible-items`). Middle segments appear in the overflow menu (ellipsis).
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
 * Folder-path breadcrumbs; forwards `sp-breadcrumbs` selection as `sl-browse-navigate`.
 * @fires sl-browse-navigate - detail: { pathKey: string }
 * @customElement sl-browse-breadcrumbs
 */
export class SlBrowseBreadcrumbs extends LitElement {
  static properties = {
    /** Path segments under org/site (e.g. `['org','site','folder']`). */
    segments: { type: Array },
    /**
     * How many non-root crumbs stay visible at the trail end; others use the overflow menu.
     * Root stays visible via `slot="root"` on the first item.
     */
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

  /**
   * Forwards `sp-breadcrumbs` `change` to {@link SlBrowseBreadcrumbs#emitNavigateEvent}.
   * @param {CustomEvent<{ value?: string }>} event - Spectrum breadcrumbs `change`.
   */
  _handleBreadcrumbsChange(event) {
    const pathKey = event.detail?.value;
    if (!pathKey) return;
    this.emitNavigateEvent(String(pathKey));
  }

  render() {
    const crumbItems = buildBreadcrumbItemsFromPathSegments(this.segments);
    /* Few crumbs: avoid Spectrum overflow math (`adjustOverflow` / isVisible) which can throw. */
    const crumbCount = crumbItems.length || 1;
    const maxVisibleItems = crumbCount <= 3 ? 99 : this.visiblePathTailCount;
    return html`
      <div class="sl-crumb-bar">
        <sp-breadcrumbs
          class="sl-crumb-sp"
          label="Folder path"
          menu-label="${BREADCRUMB_OVERFLOW_MENU_LABEL}"
          max-visible-items="${maxVisibleItems}"
          @change="${this._handleBreadcrumbsChange}"
        >
          ${crumbItems.length === 0
            ? html`<sp-breadcrumb-item isLastOfType>Browse</sp-breadcrumb-item>`
            : crumbItems.map((crumb, crumbIndex) => {
                const isLastItem = crumbIndex === crumbItems.length - 1;
                const isRootCrumb = crumbIndex === 0;
                return isRootCrumb
                  ? html`
                      <sp-breadcrumb-item
                        slot="root"
                        .value="${crumb.value}"
                        ?isLastOfType="${isLastItem}"
                        title="${crumb.label}"
                      >
                        ${crumb.label}
                      </sp-breadcrumb-item>
                    `
                  : html`
                      <sp-breadcrumb-item
                        .value="${crumb.value}"
                        ?isLastOfType="${isLastItem}"
                        title="${crumb.label}"
                      >
                        ${crumb.label}
                      </sp-breadcrumb-item>
                    `;
              })}
        </sp-breadcrumbs>
      </div>
    `;
  }
}

if (!customElements.get('sl-browse-breadcrumbs')) {
  customElements.define('sl-browse-breadcrumbs', SlBrowseBreadcrumbs);
}
