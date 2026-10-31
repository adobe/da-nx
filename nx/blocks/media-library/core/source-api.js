/**
 * Worker-safe source URL and request helpers.
 * Legacy DA sites keep their content on DA admin; Helix 6 sites on the AEM source bus.
 * Paths are site paths: /org/site/...
 */

import { AEM_API_ORIGIN } from './constants.js';

const isSourceBus = (sourceOrigin) => sourceOrigin === AEM_API_ORIGIN;

function splitSitePath(path) {
  const [, org, site, ...rest] = path.split('/');
  return { org, site, rest: rest.length ? `/${rest.join('/')}` : '' };
}

export function getSourceUrl({ sourceOrigin, path }) {
  if (!isSourceBus(sourceOrigin)) return `${sourceOrigin}/source${path}`;
  const { org, site, rest } = splitSitePath(path);
  return `${sourceOrigin}/${org}/sites/${site}/source${rest}`;
}

export function getListUrl({ sourceOrigin, path }) {
  if (!isSourceBus(sourceOrigin)) return `${sourceOrigin}/list${path}`;
  const { org, site, rest } = splitSitePath(path.replace(/\/+$/, ''));
  return `${sourceOrigin}/${org}/sites/${site}/source${rest}/`;
}

function toDaItem(parent, item) {
  const isFolder = item.name.endsWith('/') || item['content-type'] === 'application/folder';
  const fileName = item.name.replace(/\/$/, '');
  const path = `${parent}/${fileName}`;
  const dot = fileName.lastIndexOf('.');
  if (isFolder || dot <= 0) return { name: fileName, path };
  const lastModified = Date.parse(item['last-modified']);
  return {
    name: fileName.slice(0, dot),
    ext: fileName.slice(dot + 1),
    path,
    ...(Number.isNaN(lastModified) ? {} : { lastModified }),
  };
}

export function toListItems({ sourceOrigin, path, body }) {
  if (!isSourceBus(sourceOrigin)) return Array.isArray(body) ? body : (body?.sources || []);
  if (!Array.isArray(body)) return [];
  const parent = path.replace(/\/+$/, '');
  return body
    .filter((item) => item?.name && !item.name.startsWith('.'))
    .map((item) => toDaItem(parent, item));
}

export function toSaveOptions({
  sourceOrigin, json, method = 'PUT', formData = false,
}) {
  if (isSourceBus(sourceOrigin)) {
    return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json };
  }
  if (!formData) return { method, body: json };
  const body = new FormData();
  body.append('data', new Blob([json], { type: 'application/json' }));
  return { method, body };
}
