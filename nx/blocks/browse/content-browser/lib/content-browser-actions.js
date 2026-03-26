/**
 * Content browser actions: pure helpers plus `createBrowseActions(host)` for AEM preview/publish
 * and batch delete. The host is typically `sl-content-browser`; callbacks are read at call time.
 */

import { DA_BULK_AEM_OPEN } from '../../../canvas/src/bulk-aem-modal.js';
import { crawl } from '../../../../public/utils/tree.js';
import { daItemToAdminPath } from '../api/da-browse-api.js';
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
 * Collects AEM paths for preview/publish from a menu row or the current table selection.
 * Includes both files and folders.
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
    if (item) {
      const aemPath = pathKeyToAemPath(rowKey);
      if (aemPath) paths.push(aemPath);
    }
  }
  return paths;
}

/**
 * @param {string | undefined} pathKeyFromEvent
 * @param {{ selectedRows: string[], items: object[], folderPathKey: string }} ctx
 * @returns {{ filePaths: string[], folderPaths: string[] }} Absolute `/org/site/...` paths.
 */
function categorizeAemBulkSelection(pathKeyFromEvent, { selectedRows, items, folderPathKey }) {
  /** @type {string[]} */
  const filePaths = [];
  /** @type {string[]} */
  const folderPaths = [];

  const classify = (rowKey, item) => {
    const aemPath = pathKeyToAemPath(rowKey);
    if (!aemPath || !item) return;
    if (item.ext) filePaths.push(aemPath);
    else folderPaths.push(aemPath);
  };

  if (pathKeyFromEvent) {
    const item = findItemByRowKey(pathKeyFromEvent, items, folderPathKey);
    classify(pathKeyFromEvent, item);
    return { filePaths, folderPaths };
  }
  for (const rowKey of selectedRows) {
    const item = findItemByRowKey(rowKey, items, folderPathKey);
    classify(rowKey, item);
  }
  return { filePaths, folderPaths };
}

/**
 * Recursively lists files under the given folder path(s) via DA list crawl (folders excluded).
 * @param {string[]} folderDaPaths - Absolute paths like `/org/site/subfolder`.
 * @returns {Promise<string[]>}
 */
async function expandFolderDaPathsToFileAemPaths(folderDaPaths) {
  const roots = (folderDaPaths || [])
    .map((p) => String(p).trim())
    .filter((p) => p.startsWith('/'));
  if (roots.length === 0) return [];

  const { results } = crawl({
    path: roots.length === 1 ? roots[0] : roots,
    throttle: 10,
  });
  const fileItems = await results;
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const item of fileItems) {
    if (item?.ext) {
      const abs = daItemToAdminPath(item, '');
      if (abs) {
        const norm = abs.replace(/\/+/g, '/');
        if (!seen.has(norm)) {
          seen.add(norm);
          out.push(norm);
        }
      }
    }
  }
  return out;
}

/**
 * @param {string[]} paths
 * @returns {string[]}
 */
function dedupeAemAbsolutePaths(paths) {
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const p of paths) {
    const norm = String(p).replace(/\/+/g, '/');
    if (norm.startsWith('/') && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

/**
 * Resolves paths for bulk preview/publish: selected files are kept; each selected folder is crawled
 * recursively and only descendant file paths are included (folder paths themselves are omitted).
 *
 * @param {string | undefined} pathKeyFromEvent - Optional single-row key from a menu event.
 * @param {{ selectedRows: string[], items: object[], folderPathKey: string }} ctx
 * @returns {Promise<string[]>} Unique absolute DA paths ready for `saveToAem` / bulk modal.
 */
export async function resolveBulkAemPathsExpandingFolders(pathKeyFromEvent, ctx) {
  const { filePaths, folderPaths } = categorizeAemBulkSelection(pathKeyFromEvent, ctx);
  const fromTrees = await expandFolderDaPathsToFileAemPaths(folderPaths);
  return dedupeAemAbsolutePaths([...filePaths, ...fromTrees]);
}

/**
 * Normalize `/org/site/...` paths to the shape expected by `da-bulk-aem-modal` (no leading slash).
 * @param {string[]} paths
 * @returns {string[]}
 */
export function pathsToBulkAemFileList(paths) {
  return (Array.isArray(paths) ? paths : [])
    .map((p) => String(p).replace(/^\/+/, '').trim())
    .filter(Boolean);
}

/**
 * Opens the bulk AEM modal (same as canvas chat). The host page must mount
 * `<da-bulk-aem-modal>` and register a `window` listener — see `browse.js`.
 * @param {string[]} paths - Paths from {@link getAemPathsForSelection} (`/org/site/...`).
 * @param {'preview'|'publish'} mode
 */
export function dispatchBulkAemOpen(paths, mode) {
  const files = pathsToBulkAemFileList(paths);
  if (files.length === 0) return;
  window.dispatchEvent(new CustomEvent(DA_BULK_AEM_OPEN, {
    detail: { files, mode },
  }));
}

/** @see BrowseView — syncs table selection into `da-chat` `.onPageContextItems`. */
export const SL_CONTENT_BROWSER_CHAT_CONTEXT = 'sl-content-browser-chat-context';

/** @see BrowseView — toolbar `sl-browse-new` list `write` permission from folder list. */
export const SL_CONTENT_BROWSER_LIST_PERMISSIONS = 'sl-content-browser-list-permissions';

/**
 * Dedupes by `pathKey`, keeps first-seen order, renumbers `proseIndex`.
 * @param {Array<object>} a
 * @param {Array<object>} b
 * @returns {Array<object>}
 */
export function mergeBrowseChatContextItems(a, b) {
  const seen = new Set();
  /** @type {Array<object>} */
  const out = [];
  let proseIndex = 0;
  for (const it of [...(a || []), ...(b || [])]) {
    const raw = it && typeof it.pathKey === 'string' ? it.pathKey : '';
    const pk = raw.replace(/^\/+/, '').trim();
    if (pk && !seen.has(pk)) {
      seen.add(pk);
      out.push({
        ...it,
        proseIndex,
      });
      proseIndex += 1;
    }
  }
  return out;
}

/**
 * Chat context items for selected repo paths (files and folders; same pipeline as canvas
 * `onPageContextItems`). Sanitized in `chat-controller.js` before send.
 *
 * Rows not found in `items` still produce an item when `pathKey` looks like a repo path
 * (`org/site/...`) so chat context survives list/search lookup gaps.
 *
 * @param {string[]} selectedRows - Row keys from the table.
 * @param {object[]} items - Raw list rows.
 * @param {string} folderPathKey - Current folder path key.
 * @returns {Array<object>} Browse chat context item payloads.
 */
export function buildBrowseChatContextItems(selectedRows, items, folderPathKey) {
  /** @type {Array<object>} */
  const out = [];
  let proseIndex = 0;
  for (const rowKey of selectedRows || []) {
    const pathKey = String(rowKey).replace(/^\/+/, '').trim();
    if (pathKey) {
      const rowItem = findItemByRowKey(rowKey, items, folderPathKey);
      const segments = pathKey.split('/').filter(Boolean);
      if (rowItem || segments.length >= 2) {
        const name = (rowItem?.name && String(rowItem.name).trim())
          || pathKey.split('/').pop()
          || pathKey;
        const innerText = `Selected repository path: ${pathKey}`;
        out.push({
          kind: 'da-browse-source',
          pathKey,
          name,
          proseIndex,
          innerText,
          blockName: name,
        });
        proseIndex += 1;
      }
    }
  }
  return out;
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
