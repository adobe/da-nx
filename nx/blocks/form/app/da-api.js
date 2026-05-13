import { DA_ORIGIN } from 'https://da.live/blocks/shared/constants.js';
import { daFetch } from 'https://da.live/blocks/shared/utils.js';

export async function fetchSourceHtml({ sourceUrl }) {
  if (!sourceUrl) return { error: 'Missing source URL.' };

  const resp = await daFetch(sourceUrl);
  if (!resp.ok) return { error: 'Could not load source document.', status: resp.status };

  return { html: await resp.text() };
}

export async function fetchSourceByPath({ path }) {
  if (!path) return { error: 'Missing source path.' };

  const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
  if (!resp.ok) return { error: 'Could not load source path.', status: resp.status };

  return { html: await resp.text() };
}

export async function listPath({ path }) {
  if (!path) return { error: 'Missing list path.' };

  const resp = await daFetch(`${DA_ORIGIN}/list${path}`);
  if (!resp.ok) return { error: 'Could not list path.', status: resp.status };

  const json = await resp.json();
  if (!Array.isArray(json)) return { error: 'List payload is invalid.' };

  return { json };
}

export async function saveSourceHtml({ path, html }) {
  if (!path || typeof html !== 'string') return { error: 'Invalid save input.' };

  const body = new FormData();
  body.append('data', new Blob([html], { type: 'text/html' }));

  const resp = await daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'POST',
    body,
  });

  if (!resp.ok) return { error: 'Could not save source document.', status: resp.status };

  return { ok: true };
}
