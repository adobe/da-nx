import { getConfig } from '../../../scripts/nexter.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { daFetch } from '../../../utils/daFetch.js';
import { loadIms } from '../../../utils/ims.js';

const { nxBase: nx } = getConfig();

const CONFIG_PATH = '/.da/translate-v2.json';

export const VIEWS = [
  'dashboard',
  'basics',
  'validate',
  'options',
  'sync',
  'translate',
  'rollout',
  'complete',
];

const PROJECT_CACHE = {};
let CONFIG_CACHE;

/**
 * Has Extension
 *
 * @param {*} path the path supplied by the author
 * @returns {Boolean} whether or not the path has an extension
 */
export function getHasExt(path) {
  const name = path.split('/').pop();
  return name.split('.').length > 1;
}

export function formatDate(timestamp) {
  const rawDate = timestamp ? new Date(timestamp) : new Date();
  const date = rawDate.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  const time = rawDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return { date, time };
}

function getExtPath(path) {
  const name = path.split('/').pop();
  const split = name.split('.');
  return split.length > 1 ? { path, ext: split.pop() } : { path: `${path}.html`, ext: 'html' };
}

/**
 * Get base path
 *
 * Used to de-regionalize a path
 * @param config The path config.
 * @param config.prefix The prefix to check the path for.
 * @param config.path An AEM-formatted (no org, site, index, no .html) path to de-region.
 */
export function getBasePath({ prefix, path }) {
  if (!prefix) return path;
  return path.startsWith(prefix) ? path.replace(prefix, '') : path;
}

/**
 * Convert a path to DA and AEM formatted w/ optional destination language prefix
 *
 * @param config The path config.
 * @param config.path An AEM-formatted (no org, site, index, .html) supplied path.
 * @param config.sourcePrefix The prefix to remove.
 * @param config.destPrefix The prefix to attach.
 */
export function convertPath({ path, sourcePrefix, destPrefix }) {
  const prefix = sourcePrefix === '/' || !sourcePrefix ? '' : sourcePrefix;

  // Ensure the path doesn't already have the prefix
  const plainBasePath = getBasePath({ prefix, path });

  // Determine if we need to add index
  const aemBasePath = plainBasePath.endsWith('/') ? `${plainBasePath}index` : plainBasePath;

  // Get the extension base path (for use with DA API)
  // We also use ext to determine things like conflict behavior
  const { path: daBasePath, ext } = getExtPath(aemBasePath);

  const daDestPath = `${destPrefix}${daBasePath}`;

  const aemDestPath = `${destPrefix}${aemBasePath}`;

  return { daBasePath, daDestPath, aemBasePath, aemDestPath, ext };
}

export function formatPath(org, site, sourceLocation, path) {
  const hasSourceLocaction = path.startsWith(sourceLocation)
    && path !== sourceLocation
    && sourceLocation !== '/';

  // Get site source prefix for later use in saving to other langs
  const sourceLangPrefix = `/${org}/${site}${sourceLocation}`;

  // Determine if we need to add index
  const indexedPath = path.endsWith('/') ? `${path}index` : path;

  // Determine if supplied path needs source location added
  const toTranslatePath = hasSourceLocaction ? indexedPath : `${sourceLocation}${indexedPath}`;

  const hasExt = getHasExt(toTranslatePath);

  // Determine a source location for DA Admin
  const langPath = hasExt ? toTranslatePath : `${toTranslatePath}.html`;
  const daLangPath = `/${org}/${site}${langPath}`;

  // Determine if lang agnostic path needs source location removed
  const basePath = hasSourceLocaction ? indexedPath : indexedPath.replace(sourceLocation, '');

  // daBasePath is used as a language agnostic identifier for localization services
  const daBasePath = hasExt ? basePath : `${basePath}.html`;

  // Where would this live on AEM?
  const aemHref = `https://main--${site}--${org}.aem.page${path}`;

  return {
    sourceLangPrefix,
    langPath,
    daLangPath,
    daBasePath,
    aemHref,
    basePath,
    toTranslatePath,
    hasExt,
  };
}

export function getPathDetails() {
  const { hash } = window.location;

  // if no hash, we should be on basics
  if (!hash || hash === '#') {
    window.location.hash = '/basics';
    return { view: 'basics' };
  }

  // Remove '#/';
  const path = hash.substring(2);

  if (!path) {
    window.location.hash = '/basics';
    return { view: 'basics' };
  }

  // If its only two segments, they have an org and site
  const split = path.split('/');
  if (split.length === 2) {
    const [org, site] = split;

    window.location.hash = `/dashboard/${org}/${site}`;
    return { view: 'dashboard', org, site };
  }

  // Split to the parts we care about
  const [view, org, site, ...projectParts] = split;

  const knownView = VIEWS.some((known) => view === known);

  if (!knownView) {
    // If there's no site or org, drop them to basics
    if (!(org && site)) {
      window.location.hash = '/basics';
      return { view: 'basics' };
    }
  }

  return {
    view,
    org,
    site,
    path: projectParts.length && `/${projectParts.join('/')}`,
  };
}

export async function fetchConfig(org, site) {
  if (CONFIG_CACHE) return CONFIG_CACHE;

  const fetchConf = async (path) => {
    try {
      const resp = await daFetch(path);
      if (!resp.ok) return { error: 'Options not available.' };
      return resp.json();
    } catch {
      return { config: { data: [] } };
    }
  };

  // Attempt a site based config
  let options = await fetchConf(`${DA_ORIGIN}/source/${org}/${site}${CONFIG_PATH}`);

  // Attempt an org based config
  if (options.error) {
    options = await fetchConf(`${DA_ORIGIN}/source/${org}${CONFIG_PATH}`);
  }

  // Fallback to zero config defaults
  if (options.error) {
    options = await fetchConf(`${nx}/blocks/loc/setup/translate.json`);
  }

  CONFIG_CACHE = options;

  return options;
}

export async function fetchProjectOld(path, detail) {
  // If there's a local cache at the location, use it.
  if (!detail && PROJECT_CACHE[path]) return { project: PROJECT_CACHE[path] };

  const opts = {};
  if (detail) {
    const content = JSON.stringify(detail);
    const data = new Blob([content], { type: 'application/json' });

    const body = new FormData();
    body.append('data', data);

    opts.method = 'POST';
    opts.body = body;
  }

  const resp = await daFetch(`${DA_ORIGIN}/source${path}.json`, opts);
  if (!resp.ok) {
    if (resp.status === 404) return { project: { title: 'New project' } };
    if (resp.status === 401 || resp.status === 403) {
      const [org, site] = path.substring(1).split('/');
      return {
        error: {
          message: `Not authorized for: ${org} / ${site}.`,
          help: 'Are you logged into the correct profile?',
          status: resp.status,
        },
      };
    }
    return { error: `Unknown error for: ${path}.` };
  }

  // Cache for future requests
  // If detail was supplied, it was a POST, so use detail
  // Otherwise GET will have the data we want.
  PROJECT_CACHE[path] = detail || await resp.json();

  // Set the title of the doc
  const { title } = PROJECT_CACHE[path];
  if (title) document.title = `${title} - DA Translation`;

  return { project: PROJECT_CACHE[path] };
}

// All top level properties to persist
// const { view, org, site, title, options, langs, urls } = detail;
export async function saveProjectOld(projPath, updates) {
  const { org, site } = updates;

  const now = Date.now();

  const path = projPath || `/.da/translation/active/${now}`;

  const fullpath = `/${org}/${site}${path}`;

  const { project: existing } = await fetchProject(fullpath);

  const ims = await loadIms();

  // Only set createdBy if the project is new
  if (!existing.org) existing.createdBy = ims.email;

  // Always set modifiedBy and modifiedDate
  existing.modifiedBy = ims.email;
  existing.modifiedDate = now;

  // Merge the existing json with the new updates
  const detail = { ...existing, ...updates };

  const { error, project } = await fetchProject(fullpath, detail);
  if (error) return { error };
  return { project: { ...project, path } };
}

export function getHasSync(urls, options) {
  const location = options['source.language']?.location || '/';
  return urls.some((url) => !url.suppliedPath.startsWith(location));
}

export function getHasCopy(langs) {
  return langs?.some((lang) => lang.action === 'copy');
}

export function getHasTranslate(langs) {
  return langs?.some((lang) => lang.action === 'translate');
}

export function getHasRollout(langs) {
  return langs?.some((lang) => lang.locales?.length > 0);
}

export function getTranslateText(langs) {
  const hasTranslate = getHasTranslate(langs);
  const hasCopy = getHasCopy(langs);
  if (hasTranslate && !hasCopy) return 'Translate sources';
  if (!hasTranslate && hasCopy) return 'Copy sources';
  if (hasTranslate && hasCopy) return 'Translate & copy';
  return null;
}

export function getRolloutText(langs) {
  const hasRollout = getHasRollout(langs);
  if (hasRollout) return 'Rollout locales';
  return null;
}

export function getSyncText(urls, options) {
  const hasSync = getHasSync(urls, options);
  if (hasSync) return 'Sync sources';
  return null;
}

export function getDashboardText() {
  return 'Dashboard';
}

// BEFORE TIMES

export function getHashDetails(hash) {
  const path = hash.substring(1);

  if (!path) return { hash: '/basics' };

  const split = path.substring(1).split('/');
  if (split.length <= 1) return { view: 'basics' };

  // If the view is unknown, but we have a path, we were passed an org / site from the all apps view
  if (!VIEWS.includes(split[0])) return { hash: `/dashboard/${split[0]}/${split[1]}` };

  const projPath = split.slice(3).length ? `/${split.slice(3).join('/')}` : undefined;

  // Return back view, org, site if the view is known
  return { view: split[0], org: split[1], site: split[2], path: projPath };
}

async function fetchProject({ path, updates }) {
  // If there's no updates, and there's a cache, use it.
  if (!updates && PROJECT_CACHE[path]) return { project: PROJECT_CACHE[path] };

  const opts = {};
  if (updates) {
    const content = JSON.stringify(updates);
    const data = new Blob([content], { type: 'application/json' });

    const body = new FormData();
    body.append('data', data);

    opts.method = 'POST';
    opts.body = body;
  }

  const resp = await daFetch(`${DA_ORIGIN}/source${path}.json`, opts);
  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      const [org, site] = path.substring(1).split('/');
      return { message: { text: `Not authorized for: ${org} / ${site}.` } };
    }
    return { message: { text: `Unknown error for: ${path}.` } };
  }

  // Cache for future requests
  PROJECT_CACHE[path] = updates || await resp.json();

  // Set the title of the doc
  const { title } = PROJECT_CACHE[path];
  document.title = `${title} - DA Translation`;

  return { project: PROJECT_CACHE[path] };
}

export async function updateProject({ path: suppliedPath, updates }) {
  const now = Date.now();
  const projectPath = suppliedPath || `/.da/translation/active/${now}`;

  const path = `/${updates.org}/${updates.site}${projectPath}`;

  const { email } = await loadIms();

  // Only set createdBy if the project is new
  if (!suppliedPath) updates.createdBy = email;

  // Always set modifiedBy and modifiedDate
  updates.modifiedBy = email;
  updates.modifiedDate = now;

  const { message, project } = await fetchProject({ path, updates });

  // Only set a hash if the updates have a view
  const hash = updates.view ? `/${project.view}${path}` : undefined;

  return { message, hash, project };
}

export async function loadProject({ path }) {
  return fetchProject({ path });
}
