// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';
import { pathInfoHasChanged } from '../../shared/path-context.js';

const style = await getStyle(import.meta.url);

/**
 * Headless coordinator: loads the current folder via `listFolder`, optional AEM enrich.
 * Emits `sl-browse-folder-sync-start` then `sl-browse-folder-state` for the shell to render.
 *
 * @fires sl-browse-folder-sync-start - detail: { fullpath: string }
 * @fires sl-browse-folder-state - detail: rawItems, loading, error, currentPathKey,
 *   permissions (optional `x-da-actions` from list)
 * @customElement sl-browse-folder
 */
export class SlBrowseFolder extends LitElement {
  static properties = {
    /**
     * Active folder: `{ pathSegments: string[], fullpath: string } | null`
     * Compared by `fullpath` so a fresh object from the host each render does not re-sync.
     * @type {{ pathSegments: string[], fullpath: string } | null | undefined}
     */
    pathInfo: {
      type: Object,
      attribute: false,
      hasChanged: pathInfoHasChanged,
    },
    /**
     * `object[]` or `{ items, permissions? }` (see `createListFetcher`).
     * @type {((fullpath: string) => Promise<
     *   object[] | { items: object[], permissions?: string[] }>) | undefined}
     */
    listFolder: { attribute: false },
    /** @type {((items: object[], fullpath: string) => Promise<object[]>) | undefined} */
    aemEnrichListItems: { attribute: false },
  };

  constructor() {
    super();
    this.pathInfo = null;
    this.listFolder = undefined;
    this.aemEnrichListItems = undefined;
    this._folderLoadGeneration = 0;
    /** @type {object[]} */
    this._lastRawItems = [];
    /** Skip one `updated` after `firstUpdated` so we do not double-fetch. */
    this._skipNextUpdatedSync = false;
    /** @type {string[] | undefined} */
    this._lastListPermissions = undefined;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  firstUpdated() {
    this.syncFromPath();
    this._skipNextUpdatedSync = true;
  }

  /**
   * @param {Map<PropertyKey, unknown>} changedProperties
   */
  updated(changedProperties) {
    super.updated(changedProperties);
    const consumeSkip = this._skipNextUpdatedSync;
    if (this._skipNextUpdatedSync) {
      this._skipNextUpdatedSync = false;
    }
    const depsChanged = changedProperties.has('pathInfo')
      || changedProperties.has('listFolder')
      || changedProperties.has('aemEnrichListItems');
    if (!depsChanged) return;
    if (consumeSkip) return;
    this.syncFromPath();
  }

  /** @public — re-fetch current folder (e.g. after rename/delete). */
  syncFromPath() {
    return this._syncFromPath();
  }

  _emitSyncStart(fullpath) {
    this.dispatchEvent(
      new CustomEvent('sl-browse-folder-sync-start', {
        detail: { fullpath },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _emitState(rawItems, loading, error, currentPathKey, permissions) {
    this.dispatchEvent(
      new CustomEvent('sl-browse-folder-state', {
        detail: { rawItems, loading, error, currentPathKey, permissions },
        bubbles: true,
        composed: true,
      }),
    );
  }

  async _syncFromPath() {
    this._folderLoadGeneration += 1;
    const loadGeneration = this._folderLoadGeneration;
    const pathInfo = this.pathInfo ?? null;
    const currentPathKey = pathInfo?.pathSegments?.length
      ? pathInfo.pathSegments.join('/')
      : '';

    if (!pathInfo?.fullpath || !this.listFolder) {
      this._lastRawItems = [];
      this._lastListPermissions = undefined;
      this._emitState([], false, null, currentPathKey, undefined);
      return;
    }

    const loadPath = pathInfo.fullpath;
    this._emitSyncStart(loadPath);
    this._emitState(this._lastRawItems, true, null, currentPathKey, this._lastListPermissions);

    try {
      const raw = await this.listFolder(loadPath);
      let items;
      let listPermissions;
      if (Array.isArray(raw)) {
        items = raw;
      } else if (raw && typeof raw === 'object' && Array.isArray(raw.items)) {
        items = raw.items;
        listPermissions = raw.permissions;
      } else {
        items = [];
      }
      if (loadGeneration !== this._folderLoadGeneration) return;
      if (this.pathInfo?.fullpath !== loadPath) return;
      this._lastRawItems = items;
      this._lastListPermissions = listPermissions;
      this._emitState(items, false, null, currentPathKey, listPermissions);
      this._scheduleAemEnrich(items, loadPath, loadGeneration);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load';
      if (loadGeneration !== this._folderLoadGeneration) return;
      this._lastRawItems = [];
      this._emitState([], false, message, currentPathKey, this._lastListPermissions);
    }
  }

  /**
   * @param {object[]} items
   * @param {string} fullpath
   * @param {number} loadGeneration
   */
  _scheduleAemEnrich(items, fullpath, loadGeneration) {
    const enrich = this.aemEnrichListItems;
    if (!enrich || !fullpath) return;
    Promise.resolve(enrich(items, fullpath))
      .then((enriched) => {
        if (loadGeneration !== this._folderLoadGeneration) return;
        if (this.pathInfo?.fullpath !== fullpath) return;
        if (!Array.isArray(enriched)) return;
        this._lastRawItems = enriched;
        const currentPathKey = this.pathInfo?.pathSegments?.length
          ? this.pathInfo.pathSegments.join('/')
          : '';
        this._emitState(enriched, false, null, currentPathKey, this._lastListPermissions);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[sl-browse-folder] aemEnrichListItems failed', err);
      });
  }

  render() {
    return html``;
  }
}

customElements.define('sl-browse-folder', SlBrowseFolder);
