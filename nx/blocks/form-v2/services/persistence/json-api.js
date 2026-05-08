import { DA_ORIGIN } from 'https://da.live/blocks/shared/constants.js';
import { daFetch } from 'https://da.live/blocks/shared/utils.js';
import json2html from '../../adapters/json2html.js';

export async function fetchSourceHtml({ sourceUrl }) {
  if (!sourceUrl) {
    return { error: 'Missing source URL.' };
  }

  const resp = await daFetch(sourceUrl);
  if (!resp.ok) {
    return { error: 'Could not load source document.', status: resp.status };
  }

  return { html: await resp.text() };
}

export async function fetchSourceByPath({ path }) {
  if (!path) {
    return { error: 'Missing source path.' };
  }

  const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
  if (!resp.ok) {
    return { error: 'Could not load source path.', status: resp.status };
  }

  return { html: await resp.text() };
}

export async function listPath({ path }) {
  if (!path) {
    return { error: 'Missing list path.' };
  }

  const resp = await daFetch(`${DA_ORIGIN}/list${path}`);
  if (!resp.ok) {
    return { error: 'Could not list path.', status: resp.status };
  }

  const json = await resp.json();
  if (!Array.isArray(json)) {
    return { error: 'List payload is invalid.' };
  }

  return { json };
}

export async function saveSourceHtml({ path, html }) {
  if (!path || typeof html !== 'string') {
    return { error: 'Invalid save input.' };
  }

  const body = new FormData();
  const data = new Blob([html], { type: 'text/html' });
  body.append('data', data);

  const resp = await daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'POST',
    body,
  });

  if (!resp.ok) {
    return { error: 'Could not save source document.', status: resp.status };
  }

  return { ok: true };
}

export async function saveJsonDocument({ path, json }) {
  if (!json || typeof json !== 'object') {
    return { error: 'Invalid JSON payload.' };
  }

  const html = json2html(json);
  return saveSourceHtml({ path, html });
}
