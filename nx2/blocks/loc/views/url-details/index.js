import { status } from '../../../../utils/api.js';
import { getHasExt, formatDate } from '../../utils/utils.js';

function getDate(suppliedDate) {
  const { date, time } = formatDate(suppliedDate);
  return `${date} ${time}`;
}

function splitPath(path) {
  const [, org, site, ...parts] = path.split('/');

  // Force a trailing slash if page name is index
  if (parts[parts.length - 1] === 'index') parts[parts.length - 1] = '';

  return [org, site, ...parts];
}

export function getEditPath(path) {
  const hasExt = getHasExt(path);
  const view = hasExt ? 'sheet' : 'edit';
  const indexedPath = path.endsWith('/') ? `${path}index` : path;
  const editPath = hasExt ? indexedPath.replace('.json', '') : indexedPath;
  return `https://da.live/${view}#${editPath}`;
}

export function getAemPaths(path) {
  const [org, site, ...parts] = splitPath(path);

  // Force a trailing slash if page name is index
  if (parts[parts.length - 1] === 'index') parts[parts.length - 1] = '';

  const pathname = `/${parts.join('/')}`;
  const getPath = (tld) => `https://main--${site}--${org}.aem.${tld}${pathname}`;

  return {
    preview: getPath('page'),
    publish: getPath('live'),
  };
}

export async function getAemDetails(path) {
  const [org, site, ...parts] = splitPath(path);

  const resp = await status.get({ org, site, path: `/${parts.join('/')}` });
  if (!resp.ok) return { preview: 'Unknown', publish: 'Unknown' };
  const json = await resp.json();

  const { lastModified: previewDate } = json.preview;
  const { lastModified: publishDate } = json.live;

  return {
    preview: previewDate ? getDate(previewDate) : 'Never',
    publish: publishDate ? getDate(publishDate) : 'Never',
  };
}
