/**
 * Content browser actions: pure helpers plus `createBrowseActions(host)` for AEM preview/publish
 * and batch delete. The host is typically `sl-content-browser`; callbacks are read at call time.
 */

import { daSourcePathForItem, findItemByRowKey } from './content-browser-utils.js';

function openAemUrlWithNoCache(href) {
  window.open(`${href}?nocache=${Date.now()}`, href);
}

/**
 * @typedef {object} BrowseActionHost
 * @property {(path: string, action: 'preview'|'live') => Promise<object>} [saveToAem]
 * @property {(path: string) => Promise<{ ok?: boolean, error?: string }>} [deleteItem]
 */

/**
 * Builds an AEM admin path from a DA row key when it includes org/site.
 * @param {string} pathKey - Row or folder key.
 * @returns {string | null} Absolute path like `/org/site/...`, or null if too short.
 */
export function pathKeyToAemPath(pathKey) {
  if (!pathKey) return null;
  const normalized = `/${pathKey.replace(/^\//, '')}`;
  const segments = normalized.slice(1).split('/').filter(Boolean);
  return segments.length >= 2 ? normalized : null;
}

/**
 * Collects AEM paths for preview/publish from a menu row or the current file selection.
 * @param {string | undefined} pathKeyFromEvent - Optional single-row key from a menu event.
 * @param {{ selectedRows: string[], items: object[], folderPathKey: string }} ctx
 * @returns {string[]} Paths ready for `saveToAem`.
 */
export function getAemPathsForSelection(pathKeyFromEvent, { selectedRows, items, folderPathKey }) {
  if (pathKeyFromEvent) {
    const singlePath = pathKeyToAemPath(pathKeyFromEvent);
    return singlePath ? [singlePath] : [];
  }
  /** @type {string[]} */
  const paths = [];
  for (const rowKey of selectedRows) {
    const item = findItemByRowKey(rowKey, items, folderPathKey);
    if (item?.ext) {
      const aemPath = pathKeyToAemPath(rowKey);
      if (aemPath) paths.push(aemPath);
    }
  }
  return paths;
}

/**
 * Preview / publish / batch-delete runners bound to a host element.
 * Reads saveToAem and deleteItem from the host when each method runs.
 * @param {BrowseActionHost} host
 * @returns {object} runners
 * @returns {(paths: string[]) => Promise<void>} runners.preview
 * @returns {(paths: string[]) => Promise<void>} runners.publish
 * @returns {(daPaths: string[]) => Promise<
 *   { ok: true } | { ok: false, error: string }>} runners.batchDelete
 */
export function createBrowseActions(host) {
  return {
    async preview(paths) {
      const { saveToAem } = host;
      if (!saveToAem) return;
      for (const path of paths) {
        // eslint-disable-next-line no-await-in-loop
        const json = await saveToAem(path, 'preview');
        if (json.error) {
          // eslint-disable-next-line no-console
          console.error('[sl-content-browser] Preview failed', path, json.error);
        } else {
          const href = json.preview?.url;
          if (href) openAemUrlWithNoCache(href);
        }
      }
    },

    async publish(paths) {
      const { saveToAem } = host;
      if (!saveToAem) return;
      for (const path of paths) {
        // eslint-disable-next-line no-await-in-loop
        let json = await saveToAem(path, 'preview');
        if (json.error) {
          // eslint-disable-next-line no-console
          console.error('[sl-content-browser] Preview (before publish) failed', path, json.error);
        } else {
          // eslint-disable-next-line no-await-in-loop
          json = await saveToAem(path, 'live');
          if (json.error) {
            // eslint-disable-next-line no-console
            console.error('[sl-content-browser] Publish failed', path, json.error);
          } else {
            const href = json.live?.url;
            if (href) openAemUrlWithNoCache(href);
          }
        }
      }
    },

    /**
     * Deletes each DA path in order; stops on first failure (caller shows `sp-toast`).
     * @param {string[]} daPaths
     * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
     */
    async batchDelete(daPaths) {
      const { deleteItem } = host;
      if (!deleteItem) return { ok: false, error: 'Delete is not available.' };
      for (const daPath of daPaths) {
        // eslint-disable-next-line no-await-in-loop
        const result = await deleteItem(daPath);
        if (!result?.ok) {
          // eslint-disable-next-line no-console
          console.error('[sl-content-browser] Delete failed', daPath, result?.error);
          return { ok: false, error: result?.error || 'Delete failed' };
        }
      }
      return { ok: true };
    },
  };
}

/**
 * Resolves canvas editor path key from menu detail or single HTML selection.
 * @param {string | undefined} pathKeyFromMenu
 * @param {object} ctx
 * @param {string[]} ctx.selectedRows
 * @param {object[]} ctx.items
 * @param {string} ctx.folderPathKey
 * @param {boolean} ctx.isSingleHtmlSelected
 * @returns {string | null}
 */
export function resolveCanvasEditPathKey(pathKeyFromMenu, ctx) {
  const { selectedRows, items, folderPathKey, isSingleHtmlSelected } = ctx;
  let targetPathKey = pathKeyFromMenu;
  if (!targetPathKey) {
    if (selectedRows.length !== 1 || !isSingleHtmlSelected) return null;
    [targetPathKey] = selectedRows;
  } else {
    const item = findItemByRowKey(pathKeyFromMenu, items, folderPathKey);
    const lowerName = (item?.name || '').toLowerCase();
    const isHtml = item && (item.ext === 'html' || lowerName.endsWith('.html'));
    if (!isHtml) return null;
  }
  return targetPathKey || null;
}

/**
 * @param {string} canvasEditBase
 * @param {string} pathKey
 * @param {string} [queryString] - include leading `?` if non-empty
 * @returns {string}
 */
export function buildCanvasEditHref(canvasEditBase, pathKey, queryString = '') {
  return `${canvasEditBase.replace(/\/$/, '')}${queryString}#/${pathKey}`;
}

/**
 * @param {string} daPath - Absolute DA path e.g. `/org/site/page.html`
 * @returns {string} Hash path key without leading slash (e.g. `org/site/page.html`)
 */
export function daPathToPathKey(daPath) {
  return String(daPath || '').replace(/^\/+/, '');
}

/**
 * @param {string} sheetEditBase - e.g. `https://da.live/sheet`
 * @param {string} pathKey - No leading slash
 * @param {string} [queryString] - include leading `?` if non-empty
 */
export function buildSheetEditHref(sheetEditBase, pathKey, queryString = '') {
  const base = (sheetEditBase || 'https://da.live/sheet').replace(/\/$/, '');
  return `${base}${queryString}#/${pathKey}`;
}

/**
 * @param {string[]} rowKeys
 * @param {object[]} items
 * @param {string} folderPathKey
 * @returns {{ rowKey: string, item: object | undefined, daPath: string }[]}
 */
export function resolveDeleteTargets(rowKeys, items, folderPathKey) {
  return rowKeys
    .map((rowKey) => {
      const item = findItemByRowKey(rowKey, items, folderPathKey);
      const daPath = daSourcePathForItem(item, rowKey, folderPathKey);
      return { rowKey, item, daPath };
    })
    .filter((row) => row.daPath);
}

/** Max paths listed in the delete dialog; above this only the count is shown. */
const DELETE_CONFIRM_PATH_LIST_LIMIT = 5;

/**
 * DA paths are `/org/site/...`. UI shows everything after org/site (e.g. `/foo/bar.html`).
 * @param {string} daPath
 * @returns {string}
 */
function daPathForDeleteDialogDisplay(daPath) {
  const parts = String(daPath || '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);
  if (parts.length <= 2) {
    return parts.length === 0 ? '' : '/';
  }
  return `/${parts.slice(2).join('/')}`;
}

/**
 * @param {{ item?: { name?: string }, rowKey: string, daPath: string }[]} resolved
 * @returns {{ intro: string, paths: string[] }} `paths` empty when none or when over list limit.
 */
export function buildDeleteDialogContent(resolved) {
  const rawPaths = resolved.map((r) => r.daPath).filter(Boolean);
  if (rawPaths.length === 0) {
    return { intro: 'Confirm deletion.', paths: [] };
  }
  if (rawPaths.length > DELETE_CONFIRM_PATH_LIST_LIMIT) {
    return {
      intro: `You are about to delete ${rawPaths.length} paths.`,
      paths: [],
    };
  }
  const paths = rawPaths.map(daPathForDeleteDialogDisplay);
  if (paths.length === 1) {
    return { intro: 'The following path will be deleted:', paths };
  }
  return { intro: 'The following paths will be deleted:', paths };
}
