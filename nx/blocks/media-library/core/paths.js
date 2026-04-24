import { daFetch } from '../../../utils/daFetch.js';
import { Paths, Domains, DA_LIVE_EDIT_BASE, DA_ORIGIN } from './constants.js';
import { ErrorCodes, logMediaLibraryError } from './errors.js';
import { t } from './messages.js';
import {
  normalizeSitePath as _normalizeSitePath,
  getContentPathFromSitePath as _getContentPathFromSitePath,
} from './parse-utils.js';

function normalizeDocPath(docPath) {
  if (!docPath) return '';
  return docPath.replace(new RegExp(`${Paths.EXT_HTML.replace('.', '\\.')}$`), '')
    .replace(new RegExp(`${Paths.EXT_MD.replace('.', '\\.')}$`), '');
}

/**
 * Preview hosts resolve folder index pages at /path/, not /path/index.
 * Maps normalized doc paths like /locale/recipes/index → /locale/recipes/
 */
function previewPathFromNormalizedDoc(normalized) {
  if (!normalized) return '/';
  if (normalized === Paths.INDEX || normalized === 'index') return '/';
  if (normalized.endsWith('/index')) {
    const folder = normalized.slice(0, -'/index'.length);
    return folder ? `${folder}/` : '/';
  }
  return normalized;
}

// Shortens doc path for display (e.g. /docs/foo.html -> docs/foo).
export function formatDocPath(docPath) {
  const normalized = normalizeDocPath(docPath);
  return normalized === Paths.INDEX || normalized === 'index' ? '/' : (normalized || '/');
}

export function getEditUrl(org, repo, docPath) {
  const cleanPath = normalizeDocPath(docPath);
  return `${DA_LIVE_EDIT_BASE}${org}/${repo}${cleanPath}`;
}

export function getViewUrl(org, repo, docPath) {
  const normalized = normalizeDocPath(docPath);
  const cleanPath = previewPathFromNormalizedDoc(normalized);
  return `https://main--${repo}--${org}${Domains.AEM_PAGE}${cleanPath}`;
}

function tryDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Route segment from location.hash, without OAuth-style tails such as
 * #access_token=… that share the same URL fragment as the site path.
 * Also handles percent-encoded delimiters (e.g. …/repo%23access_token=…).
 * Strips query parameters (? or %3F) from the path.
 */
export function parseSitePathFromHash(hash) {
  if (!hash) return '';
  const withoutLeading = hash.startsWith('#') ? hash.slice(1) : hash;
  const decoded = tryDecodeURIComponent(withoutLeading);
  let path = (decoded.split('#')[0] ?? '').trim();
  if (path.includes('%23')) {
    path = (path.split('%23')[0] ?? '').trim();
  }
  // Remove query parameters (? or %3F)
  path = (path.split('?')[0] ?? '').trim();
  if (path.includes('%3F') || path.includes('%3f')) {
    path = path.replace(/(%3F|%3f).*/i, '').trim();
  }
  return path;
}

/**
 * Parses current URL into sitePath (from hash) and URLSearchParams (from regular query string).
 * Returns { sitePath: '/org/repo', params: URLSearchParams }
 */
export function parseRouteState() {
  // Read sitePath from hash (strip leading #)
  const sitePath = window.location.hash.slice(1) || '';

  // Read all params from regular query string
  const params = new URLSearchParams(window.location.search);

  return { sitePath, params };
}

/**
 * @deprecated Use parseRouteState() instead. Kept for backward compatibility.
 * Parses hash-local query params (old format: #/path?params).
 */
export function parseHashRouteState(hash) {
  if (!hash) return { sitePath: '', params: new URLSearchParams() };

  const withoutLeading = hash.startsWith('#') ? hash.slice(1) : hash;
  const decoded = tryDecodeURIComponent(withoutLeading);
  let cleanHash = (decoded.split('#')[0] ?? '').trim();

  if (cleanHash.includes('%23')) {
    cleanHash = (cleanHash.split('%23')[0] ?? '').trim();
  }

  // Look for ? delimiter
  let qIdx = cleanHash.indexOf('?');
  if (qIdx !== -1) {
    const sitePath = cleanHash.substring(0, qIdx);
    const queryString = cleanHash.substring(qIdx + 1);
    return { sitePath, params: new URLSearchParams(queryString) };
  }

  // Look for %3F encoded delimiter (case-insensitive)
  qIdx = cleanHash.toUpperCase().indexOf('%3F');
  if (qIdx !== -1) {
    const sitePath = cleanHash.substring(0, qIdx);
    const queryString = cleanHash.substring(qIdx + 3); // Skip %3F (3 chars)
    return { sitePath, params: new URLSearchParams(queryString) };
  }

  return { sitePath: cleanHash, params: new URLSearchParams() };
}

/**
 * Builds full URL with regular query params + hash sitePath.
 * Preserves environment params (nx, debug, perf) and merges with app state params.
 * Returns URL like ?nx=local&filter=videos#/org/repo
 */
export function buildUrlWithState(sitePath, appParams, preserveEnvParams = true) {
  const merged = new URLSearchParams();

  // Preserve existing environment params if requested
  if (preserveEnvParams) {
    const current = new URLSearchParams(window.location.search);
    const envParams = ['nx', 'debug', 'perf']; // Environment param whitelist
    envParams.forEach((key) => {
      const val = current.get(key);
      if (val) merged.set(key, val);
    });
  }

  // Add app state params (omit empty values)
  for (const [key, value] of appParams.entries()) {
    if (value && value.trim()) {
      merged.set(key, value);
    }
  }

  const queryString = merged.toString();
  return queryString ? `?${queryString}#${sitePath}` : `#${sitePath}`;
}

/**
 * @deprecated Use buildUrlWithState() instead. Kept for backward compatibility.
 * Builds hash string with hash-local params (old format: #/path?params).
 */
export function buildHashWithState(sitePath, params) {
  const cleanParams = new URLSearchParams();

  for (const [key, value] of params.entries()) {
    if (value && value.trim()) {
      cleanParams.set(key, value);
    }
  }

  const queryString = cleanParams.toString();
  return queryString ? `#${sitePath}?${queryString}` : `#${sitePath}`;
}

export function getBasePath() {
  const hash = parseSitePathFromHash(window.location.hash);
  if (!hash) return null;
  const parts = hash.split('/').slice(3);
  return `/${parts.join('/')}`;
}

/** Re-exported from parse-utils.js for backward compatibility */
export const normalizeSitePath = _normalizeSitePath;

/** Re-exported from parse-utils.js for backward compatibility */
export const getContentPathFromSitePath = _getContentPathFromSitePath;

export function resolveAbsolutePath(path, isFolder = false) {
  const basePath = getBasePath();
  if (!basePath || path.startsWith(basePath)) return path;
  if (isFolder && path === '/') return basePath;
  return `${basePath}${path}`;
}

// Validates sitePath exists via DA; returns org, repo, or throws.
export async function validateSitePath(sitePath) {
  if (!sitePath) {
    logMediaLibraryError(ErrorCodes.VALIDATION_SITE_PATH_MISSING, {});
    return { valid: false, error: t('VALIDATION_ENTER_SITE_URL') };
  }

  const parts = sitePath.split('/').filter(Boolean);

  if (parts.length < 2) {
    logMediaLibraryError(ErrorCodes.VALIDATION_SITE_PATH_MISSING, {});
    return {
      valid: false,
      error: t('VALIDATION_ENTER_SITE_URL'),
    };
  }

  const [org, repo, ...restPath] = parts;

  if (restPath.length === 0) {
    try {
      const listUrl = `${DA_ORIGIN}/list/${org}/${repo}`;
      const resp = await daFetch(listUrl);

      if (resp.ok) {
        const json = await resp.json();

        if (!json || (Array.isArray(json) && json.length === 0)) {
          logMediaLibraryError(ErrorCodes.VALIDATION_SITE_NOT_FOUND, { path: `/${org}/${repo}`, status: 404 });
          return {
            valid: false,
            error: t('VALIDATION_SITE_NOT_FOUND', { path: `/${org}/${repo}` }),
          };
        }

        return { valid: true, org, repo };
      }

      if (resp.status === 404) {
        logMediaLibraryError(ErrorCodes.VALIDATION_SITE_NOT_FOUND, { path: `/${org}/${repo}`, status: 404 });
        return { valid: false, error: t('VALIDATION_SITE_NOT_FOUND', { path: `/${org}/${repo}` }) };
      }

      if (resp.status === 401 || resp.status === 403) {
        logMediaLibraryError(ErrorCodes.DA_READ_DENIED, { path: `/${org}/${repo}`, status: resp.status });
        return {
          valid: false,
          error: t('VALIDATION_SITE_403'),
          suggestion: t('VALIDATION_SITE_403_SUGGESTION'),
        };
      }

      return { valid: false, error: `Validation failed: ${resp.status}` };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  const lastSegment = restPath[restPath.length - 1];
  const parentParts = [org, repo, ...restPath.slice(0, -1)];
  const parentPath = `/${parentParts.join('/')}`;

  try {
    const listUrl = `${DA_ORIGIN}/list${parentPath}`;
    const resp = await daFetch(listUrl);

    if (!resp.ok) {
      if (resp.status === 404) {
        logMediaLibraryError(ErrorCodes.VALIDATION_PATH_NOT_FOUND, {
          path: parentPath,
          status: 404,
        });
        return {
          valid: false,
          error: t('VALIDATION_PATH_NOT_FOUND', { path: parentPath }),
        };
      }

      if (resp.status === 401 || resp.status === 403) {
        logMediaLibraryError(ErrorCodes.DA_READ_DENIED, { path: parentPath, status: resp.status });
        return {
          valid: false,
          error: t('VALIDATION_PATH_403'),
          suggestion: t('VALIDATION_PATH_403_SUGGESTION'),
        };
      }

      return { valid: false, error: `Validation failed: ${resp.status}` };
    }

    const json = await resp.json();

    if (!json || (Array.isArray(json) && json.length === 0)) {
      return {
        valid: false,
        error: t('VALIDATION_PATH_EMPTY', { path: parentPath }),
      };
    }

    const targetEntry = json.find((child) => {
      const childName = child.path.split('/').pop();
      return childName === lastSegment;
    });

    if (!targetEntry) {
      logMediaLibraryError(ErrorCodes.VALIDATION_PATH_NOT_FOUND, { path: `${parentPath}/${lastSegment}`, status: 404 });
      return {
        valid: false,
        error: t('VALIDATION_PATH_NOT_FOUND_CHILD', { path: `/${[org, repo, ...restPath].join('/')}` }),
        suggestion: t('VALIDATION_PATH_NOT_FOUND_SUGGESTION', { segment: lastSegment, parentPath }),
      };
    }

    if (targetEntry.ext) {
      return {
        valid: false,
        error: t('VALIDATION_SITE_PATH_FILE'),
        suggestion: parentPath,
        isFile: true,
        fileType: targetEntry.ext,
        fileName: lastSegment,
      };
    }

    return { valid: true, org, repo };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
