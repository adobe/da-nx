import { HLX_ADMIN } from '../../../../../nx2/utils/utils.js';
import { daFetch } from '../../../../../nx2/utils/api.js';
import { fetchDaConfigs, getFirstSheet } from '../../../../../nx2/utils/daConfig.js';
import { isEWEnabled } from '../../../../../nx2/utils/ewFlags.js';
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

// Mirrors da-live's da-browse.js getEditor(): EW flag picks the canvas/edit
// default, then the site's `editor.path` config rows override by longest
// path-prefix match, so linked-page edit URLs land in the same editor browse would use.
async function getEditorRoute({ org, site, path }) {
  const isEW = await isEWEnabled({ org, site });
  const defRoute = isEW ? '/canvas#' : '/edit#';

  const configs = await Promise.all(fetchDaConfigs({ org, site }));
  const rows = configs.filter(Boolean).reverse().flatMap((c) => getFirstSheet(c) || []);
  const editorConfs = rows.reduce((acc, row) => {
    if (row.key === 'editor.path') acc.push(row.value);
    return acc;
  }, []);

  const matchedConfs = editorConfs.filter((conf) => path.startsWith(conf.split('=')[0]));
  if (matchedConfs.length === 0) return defRoute;

  const matchedConf = matchedConfs.sort((a, b) => b.split('=')[0].length - a.split('=')[0].length)[0];
  return matchedConf.split('=')[1];
}

export async function getEditPath(path) {
  const hasExt = getHasExt(path);
  const indexedPath = path.endsWith('/') ? `${path}index` : path;
  const editPath = hasExt ? indexedPath.replace('.json', '') : indexedPath;

  if (hasExt) return `https://da.live/sheet#${editPath}`;

  const [, org, site] = path.split('/');
  const route = await getEditorRoute({ org, site, path: editPath });

  if (route.includes('experience.adobe.com')) {
    return `${route}/${editPath.split('/').slice(3).join('/')}`;
  }

  const base = route.startsWith('http') ? route : `https://da.live${route}`;
  return `${base}${editPath}`;
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

  const resp = await daFetch({ url: `${HLX_ADMIN}/status/${org}/${site}/main/${parts.join('/')}` });
  if (!resp.ok) return { preview: 'Unknown', publish: 'Unknown' };
  const json = await resp.json();

  const { lastModified: previewDate } = json.preview;
  const { lastModified: publishDate } = json.live;

  return {
    preview: previewDate ? getDate(previewDate) : 'Never',
    publish: publishDate ? getDate(publishDate) : 'Never',
  };
}
