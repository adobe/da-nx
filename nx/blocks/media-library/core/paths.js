import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { Paths, Domains, DA_LIVE_EDIT_BASE } from './constants.js';
import { ErrorCodes, logMediaLibraryError } from './errors.js';
import { t } from './messages.js';

function normalizeDocPath(docPath) {
  if (!docPath) return '';
  return docPath.replace(new RegExp(`${Paths.EXT_HTML.replace('.', '\\.')}$`), '')
    .replace(new RegExp(`${Paths.EXT_MD.replace('.', '\\.')}$`), '');
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
  const cleanPath = normalized === Paths.INDEX || normalized === 'index' ? '/' : normalized;
  return `https://main--${repo}--${org}${Domains.AEM_PAGE}${cleanPath}`;
}

export function getBasePath() {
  const hash = window.location.hash?.replace('#', '');
  if (!hash) return null;
  const parts = hash.split('/').slice(3);
  return `/${parts.join('/')}`;
}

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
