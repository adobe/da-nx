/**
 * Path keys, display labels, and client-side folder filtering for the content browser.
 */

/**
 * Stable row key for an API list item (matches previous browse.js behavior).
 * @param {{ name: string, path?: string, ext?: string }} item
 * @param {string} currentPathKey - path without leading slash, e.g. org/site/folder
 * @returns {string}
 */
export function itemRowKey(item, currentPathKey) {
  const fromApi = (item.path || '').replace(/^\//, '');
  if (fromApi) return fromApi.replace(/\/+/g, '/');
  return `${currentPathKey}/${item.name}`.replace(/\/+/g, '/');
}

/**
 * @param {string} rowKey
 * @param {Array<{ name: string, path?: string, ext?: string }>} items
 * @param {string} currentPathKey
 */
export function findItemByRowKey(rowKey, items, currentPathKey) {
  return items.find((i) => itemRowKey(i, currentPathKey) === rowKey);
}

/**
 * Path for DA admin `DELETE /source{path}` (leading slash, org/site/…).
 * @param {{ name?: string, path?: string, ext?: string } | undefined} item
 * @param {string} rowKey
 * @param {string} currentPathKey
 * @returns {string}
 */
export function daSourcePathForItem(item, rowKey, currentPathKey) {
  const p = (item?.path || '').replace(/^\/+/, '').trim();
  if (p) return `/${p}`;
  const rk = (rowKey || (item ? itemRowKey(item, currentPathKey) : '')).replace(/^\/+/, '');
  return rk ? `/${rk}` : '';
}

/**
 * Same org/site/… parent, new file basename (for DA `move` `destination` field).
 * @param {string} sourceDaPath - `/org/site/path/to/file.html`
 * @param {string} newBaseName - `file2.html` (no slashes)
 * @returns {string} `/org/site/path/to/file2.html` or `''` if invalid
 */
export function daRenameDestinationPath(sourceDaPath, newBaseName) {
  const name = (newBaseName || '').trim();
  if (!name || name.includes('/')) return '';
  const norm = (sourceDaPath || '').replace(/^\/+/, '').replace(/\/+$/, '');
  const parts = norm.split('/').filter(Boolean);
  if (parts.length < 3) return '';
  parts[parts.length - 1] = name;
  return `/${parts.join('/')}`;
}

/**
 * Build the final path segment for DA `move` `destination`: files get `.ext` when the user omits
 * it; folders unchanged.
 * @param {string} userBasename - trimmed, no slashes
 * @param {string | undefined} fileExt - list item `ext` (e.g. `html`); omit or empty for folders
 */
export function daRenameDestinationBasename(userBasename, fileExt) {
  const t = (userBasename || '').trim();
  if (!t) return t;
  const extRaw = (fileExt || '').replace(/^\./, '');
  if (!extRaw) return t;
  const extLower = extRaw.toLowerCase();
  if (t.toLowerCase().endsWith(`.${extLower}`)) return t;
  if (!t.includes('.')) return `${t}.${extRaw}`;
  return t;
}

/** @type {Set<string>} */
const DOCUMENT_EXTS = new Set([
  'html',
  'htm',
  'md',
  'markdown',
  'json',
  'xml',
  'txt',
  'text',
  'pdf',
  'rtf',
  'doc',
  'docx',
  'ppt',
  'pptx',
]);

/** @type {Set<string>} */
const SHEET_EXTS = new Set(['xls', 'xlsx', 'csv']);

/** @type {Set<string>} */
const MEDIA_EXTS = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'bmp',
  'webp',
  'svg',
  'ico',
  'tif',
  'tiff',
  'heic',
  'avif',
  'mp4',
  'webm',
  'mov',
  'avi',
  'mkv',
  'm4v',
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'aac',
  'flac',
  'wma',
]);

/**
 * Coarse bucket for list `ext` (no leading dot).
 * @param {string | undefined | null} ext
 * @returns {'folder' | 'document' | 'media' | 'sheet' | 'other'}
 */
export function fileKindFromExtension(ext) {
  if (ext == null || ext === '') return 'folder';
  const e = String(ext).replace(/^\./, '').toLowerCase();
  if (!e) return 'folder';
  if (SHEET_EXTS.has(e)) return 'sheet';
  if (DOCUMENT_EXTS.has(e)) return 'document';
  if (MEDIA_EXTS.has(e)) return 'media';
  return 'other';
}

/** User-facing label for {@link fileKindFromExtension} (files only; folders use `Folder`). */
export const FILE_KIND_LABEL = {
  folder: 'Folder',
  document: 'Document',
  media: 'Media',
  sheet: 'Sheet',
  other: 'Other',
};

/**
 * Dropdown label for a concrete extension (legacy / tooling); list UI filters by
 * {@link filterItemsByFormatKind} instead.
 * @param {string} ext - lowercase, no dot
 * @returns {string}
 */
export function extensionFilterOptionLabel(ext) {
  const e = String(ext || '').replace(/^\./, '').toLowerCase();
  const kind = fileKindFromExtension(e);
  const cat = FILE_KIND_LABEL[kind];
  return `${cat} (.${e})`;
}

/**
 * @param {{ name: string, ext?: string }} item
 * @returns {string}
 */
export function fileTypeLabel(item) {
  if (!item?.ext) return FILE_KIND_LABEL.folder;
  return FILE_KIND_LABEL[fileKindFromExtension(item.ext)];
}

/**
 * Parse list API `lastModified` (ms, unix seconds, ISO string, or numeric string).
 * @param {string | number | undefined | null} raw
 * @returns {Date | null}
 */
export function coerceListModifiedDate(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Localized label + optional ISO `title` for table cells.
 * @param {string | number | undefined | null} raw
 * @returns {{ label: string, title?: string }}
 */
export function lastModifiedCell(raw) {
  if (raw == null || raw === '') return { label: '—' };
  const d = coerceListModifiedDate(raw);
  if (!d) return { label: String(raw), title: String(raw) };
  return {
    label: d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    title: d.toISOString(),
  };
}

/**
 * Compact “time since” for status cells (preview/publish), vs. {@link lastModifiedCell} full date.
 * @param {Date} date
 * @param {Date} [now]
 * @returns {string}
 */
export function shortRelativeTimeLabel(date, now = new Date()) {
  const t = date.getTime();
  const n = now.getTime();
  if (!Number.isFinite(t) || Number.isNaN(t)) return '—';

  let diffMs = n - t;
  if (diffMs < 0) diffMs = 0;

  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;

  const week = Math.floor(day / 7);
  if (day < 56) return `${week}w ago`;

  const cy = now.getFullYear();
  const y = date.getFullYear();
  if (y !== cy) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Last modified column: {@link shortRelativeTimeLabel} in the cell; hover shows full localized
 * datetime (like preview/publish).
 * @param {string | number | undefined | null} raw
 * @returns {{ label: string, title?: string }}
 */
export function lastModifiedRelativeCell(raw) {
  if (raw == null || raw === '') return { label: '—' };
  const d = coerceListModifiedDate(raw);
  if (!d) return { label: String(raw), title: String(raw) };
  const full = lastModifiedCell(raw);
  return {
    label: shortRelativeTimeLabel(d),
    title: `Last modified on ${full.label}`,
  };
}

/**
 * Prefer AEM admin `preview.sourceLastModified` / `preview.lastModified` when enriched, else list
 * `lastModified`.
 * @param {{
 *   lastModified?: string,
 *   aemPreviewSourceLastModified?: string,
 *   aemPreviewLastModified?: string
 * } | undefined} item
 */
export function itemLastModifiedRaw(item) {
  if (!item) return undefined;
  const aem = item.aemPreviewSourceLastModified || item.aemPreviewLastModified;
  if (aem != null && String(aem).trim() !== '') return aem;
  return item.lastModified;
}

/**
 * If `raw` looks like an email (`local@domain`), show only `local` in the cell and keep the full
 * string for tooltips.
 * @param {string} raw
 * @returns {{ label: string, title?: string }}
 */
function modifiedByDisplay(raw) {
  const at = raw.indexOf('@');
  if (at > 0 && at < raw.length - 1) {
    const local = raw.slice(0, at).trim();
    const domain = raw.slice(at + 1).trim();
    if (local && domain) {
      return { label: local, title: raw };
    }
  }
  return { label: raw };
}

/**
 * User / identity for last change: list API fields, else AEM status `profile.email` (session user
 * when present). Emails show as the part before `@`; hover `title` on the cell shows the full
 * address.
 * @param {{
 *   lastModifiedBy?: string,
 *   modifiedBy?: string,
 *   updatedBy?: string,
 *   aemProfileEmail?: string
 * } | undefined} item
 * @returns {{ label: string, title?: string }}
 */
export function lastModifiedByCell(item) {
  const raw = (typeof item?.lastModifiedBy === 'string' && item.lastModifiedBy.trim())
    || (typeof item?.modifiedBy === 'string' && item.modifiedBy.trim())
    || (typeof item?.updatedBy === 'string' && item.updatedBy.trim())
    || (typeof item?.aemProfileEmail === 'string' && item.aemProfileEmail.trim())
    || '';
  if (!raw) return { label: '—' };
  return modifiedByDisplay(raw);
}

/**
 * Yes/No from AEM status enrich (`preview` / `live` object present with `status === 200`).
 * @param {boolean | undefined} ok
 * @param {boolean} isFolder
 * @returns {{ label: string, title?: string }}
 */
export function aemEnvStatusCell(ok, isFolder) {
  if (isFolder) return { label: '—' };
  if (ok === true) return { label: 'Yes', title: 'Available (status 200)' };
  if (ok === false) return { label: 'No', title: 'Not available or status not 200' };
  return { label: '—', title: 'Pending' };
}

/**
 * Preview / Published columns: show AEM `preview.lastModified` or `live.lastModified` when present
 * (HTTP-date strings from status JSON); otherwise fall back to {@link aemEnvStatusCell}.
 * @param {boolean | undefined} ok
 * @param {string | undefined | null} lastModifiedRaw
 * @param {boolean} isFolder
 * @returns {{ label: string, title?: string }}
 */
export function aemEnvLastModifiedCell(ok, lastModifiedRaw, isFolder) {
  if (isFolder) return { label: '—' };
  const raw = lastModifiedRaw != null ? String(lastModifiedRaw).trim() : '';
  if (raw) return lastModifiedCell(raw);
  return aemEnvStatusCell(ok, false);
}

/**
 * Preview / Published columns: short relative time when available (with full datetime on hover);
 * em dash otherwise.
 * @param {boolean | undefined} ok
 * @param {string | undefined | null} lastModifiedRaw
 * @param {boolean} isFolder
 * @param {'preview' | 'live'} env
 * @returns {{ label: string, title: string }}
 */
export function aemEnvDeployRelativeCell(ok, lastModifiedRaw, isFolder, env) {
  const isLive = env === 'live';
  const onVerb = isLive ? 'Published on' : 'Previewed on';
  const notVerb = isLive ? 'Not published' : 'Not previewed';

  if (isFolder) {
    return { label: '—', title: '' };
  }

  const raw = lastModifiedRaw != null ? String(lastModifiedRaw).trim() : '';
  const d = raw ? coerceListModifiedDate(raw) : null;
  const full = raw && d ? lastModifiedCell(raw) : null;

  if (ok === true) {
    if (d && full) {
      const label = shortRelativeTimeLabel(d);
      const title = `${onVerb} ${full.label}`;
      return { label, title };
    }
    return { label: '—', title: isLive ? 'Published' : 'Previewed' };
  }
  if (ok === false) {
    return { label: '—', title: notVerb };
  }

  return { label: '—', title: 'Status loading' };
}

/**
 * Client-side name filter (until a global search API exists).
 * @param {Array<{ name: string }>} items
 * @param {string} query
 */
export function filterItemsByQuery(items, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => (i.name || '').toLowerCase().includes(q));
}

/**
 * @param {'all'|'folder'|'file'} kind
 * @param {Array<{ ext?: string }>} items
 */
export function filterItemsByKind(items, kind) {
  if (kind === 'folder') return items.filter((i) => !i.ext);
  if (kind === 'file') return items.filter((i) => !!i.ext);
  return items;
}

/**
 * Keep only files whose `ext` matches (case-insensitive). Folders are removed when a specific
 * extension is set.
 * @param {Array<{ ext?: string }>} items
 * @param {string} extFilter - lowercase extension without dot, or `'all'`
 */
export function filterItemsByExtension(items, extFilter) {
  if (extFilter == null || extFilter === '' || extFilter === 'all') return items;
  const want = String(extFilter).toLowerCase();
  return items.filter((i) => i.ext && String(i.ext).toLowerCase() === want);
}

/**
 * Keep only files whose {@link fileKindFromExtension} matches. Folders are excluded when a specific
 * kind is set (same as per-extension filter).
 * @param {Array<{ ext?: string }>} items
 * @param {string} formatFilter - `'document' | 'media' | 'sheet' | 'other'` or `'all'`
 */
export function filterItemsByFormatKind(items, formatFilter) {
  if (formatFilter == null || formatFilter === '' || formatFilter === 'all') return items;
  const want = String(formatFilter).toLowerCase();
  return items.filter((i) => i?.ext && fileKindFromExtension(i.ext) === want);
}
