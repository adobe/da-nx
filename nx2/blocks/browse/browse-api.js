import { daFetch, DA_ORIGIN, AEM_ORIGIN } from '../../utils/daFetch.js';

export async function listFolder(fullpath) {
  const response = await daFetch(`${DA_ORIGIN}/list${fullpath}`);
  if (!response.ok) {
    return { error: `List failed: ${response.status}`, status: response.status };
  }
  try {
    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return { error: 'Invalid list response', status: response.status };
    }
    return payload;
  } catch {
    return { error: 'Invalid response body', status: response.status };
  }
}

export async function deleteSourcePath(path) {
  if (!path) {
    return { ok: false, error: 'Missing path' };
  }
  const response = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
  if (!response.ok) {
    const errorMessage = response.headers.get('x-error') || response.statusText || 'Delete failed';
    return { ok: false, status: response.status, error: errorMessage };
  }
  return { ok: true };
}

export async function renameSourcePath(currentPath, destination) {
  if (!currentPath || !destination) {
    return { ok: false, error: 'Missing current path or destination' };
  }
  if (currentPath === destination) {
    return { ok: true };
  }
  const sourceSegments = currentPath.replace(/^\//, '');
  const encodedSourcePath = sourceSegments
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const requestUrl = `${DA_ORIGIN}/move/${encodedSourcePath}`;
  const formData = new FormData();
  formData.append('destination', destination);

  const response = await daFetch(requestUrl, { method: 'POST', body: formData });
  if (!response.ok) {
    const errorMessage = response.headers.get('x-error') || response.statusText || 'Rename failed';
    return { ok: false, status: response.status, error: errorMessage };
  }
  return { ok: true };
}

export async function saveToAem(path, action) {
  const p = path.startsWith('/') ? path.slice(1) : path;
  const i = p.indexOf('/');
  if (i < 1) {
    return { error: 'Invalid path for AEM', status: 0 };
  }
  const j = p.indexOf('/', i + 1);
  if (j < i + 1) {
    return { error: 'Invalid path for AEM', status: 0 };
  }
  const owner = p.slice(0, i).toLowerCase();
  const repo = p.slice(i + 1, j).toLowerCase();
  const aemPath = p.slice(j + 1);
  const requestUrl = `${AEM_ORIGIN}/${action}/${owner}/${repo}/main/${aemPath}`;
  const response = await daFetch(requestUrl, { method: 'POST' });
  if (!response.ok) {
    const headerError = response.headers.get('x-error') || response.statusText || 'AEM request failed';
    return { error: headerError, status: response.status };
  }
  try {
    const json = await response.json();
    return { json };
  } catch {
    return { json: {} };
  }
}
