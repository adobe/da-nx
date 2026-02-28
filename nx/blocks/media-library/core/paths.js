import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { Paths, Domains, DA_LIVE_EDIT_BASE } from './constants.js';

function normalizeDocPath(docPath) {
  if (!docPath) return '';
  return docPath.replace(new RegExp(`${Paths.EXT_HTML.replace('.', '\\.')}$`), '')
    .replace(new RegExp(`${Paths.EXT_MD.replace('.', '\\.')}$`), '');
}

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

export async function validateSitePath(sitePath) {
  if (!sitePath) {
    return { valid: false, error: 'No site path provided' };
  }

  const parts = sitePath.split('/').filter(Boolean);

  if (parts.length < 2) {
    return {
      valid: false,
      error: 'Site path must have at least org and repo',
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
          return {
            valid: false,
            error: `Site not found: ${org}/${repo}`,
          };
        }

        return { valid: true, org, repo };
      }

      if (resp.status === 404) {
        return { valid: false, error: `Site not found: ${org}/${repo}` };
      }

      if (resp.status === 401 || resp.status === 403) {
        return {
          valid: false,
          error: `Not authorized for: ${org}/${repo}`,
          suggestion: 'Are you logged into the correct profile?',
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
        return {
          valid: false,
          error: `Parent path not found: ${parentPath}`,
        };
      }

      if (resp.status === 401 || resp.status === 403) {
        return {
          valid: false,
          error: `Not authorized for: ${org}/${repo}`,
          suggestion: 'Are you logged into the correct profile?',
        };
      }

      return { valid: false, error: `Validation failed: ${resp.status}` };
    }

    const json = await resp.json();

    if (!json || (Array.isArray(json) && json.length === 0)) {
      return {
        valid: false,
        error: `Parent path not found or empty: ${parentPath}`,
      };
    }

    const targetEntry = json.find((child) => {
      const childName = child.path.split('/').pop();
      return childName === lastSegment;
    });

    if (!targetEntry) {
      return {
        valid: false,
        error: `Path not found: ${lastSegment}`,
        suggestion: `Check that ${lastSegment} exists in ${parentPath}`,
      };
    }

    if (targetEntry.ext) {
      return {
        valid: false,
        error: 'Site path cannot point to a file',
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
