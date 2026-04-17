import { DA_ORIGIN, daFetch } from '../../../../utils/daFetch.js';

export function buildSourceUrl(path) {
  if (!path || typeof path !== 'string') return null;
  const trimmed = path.replace(/^\//, '').trim();
  if (!trimmed) return null;
  return `${DA_ORIGIN}/source/${trimmed}.html`;
}

export function parsePermissions(resp) {
  const hint = resp.headers.get('x-da-child-actions') ?? resp.headers.get('x-da-actions');
  if (hint) resp.permissions = hint.split('=').pop().split(',');
  else resp.permissions = ['read', 'write'];
  return resp;
}

export async function checkDoc(sourceUrl) {
  const resp = await daFetch(sourceUrl, { method: 'HEAD' });
  return parsePermissions(resp);
}
