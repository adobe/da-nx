import { DA_ADMIN } from '../../../../nx2/utils/utils.js';
import { daFetch, loadIms } from '../../../../nx2/utils/api.js';

const CONFIG_PATH = '/.da/translate.json';

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
 * Collect every configured source location: the default source language
 * location plus any per-language `source` override.
 * @param {Object} config The config.
 * @param {Object} config.options The project options.
 * @param {Object[]} [config.langs] The languages, optionally with a `source`.
 * @returns {string[]} Unique source locations, excluding the root.
 */
export function getSourceLocations({ options, langs }) {
  const defaultLocation = options?.['source.language']?.location;
  const locations = [defaultLocation, ...(langs || []).map((lang) => lang.source)];
  return [...new Set(locations.filter((location) => location && location !== '/'))];
}

/**
 * Get a project's source locations: the set persisted at validate, or a
 * derivation from options and langs for projects saved before it existed.
 * @param {Object} project The project.
 * @param {string[]} [project.sourceLocations] Locations persisted at validate.
 * @param {Object} [project.options] The project options.
 * @param {Object[]} [project.langs] The project languages.
 * @returns {string[]} The source locations.
 */
export function getProjectSourceLocations({ sourceLocations, options, langs }) {
  return sourceLocations ?? getSourceLocations({ options, langs });
}

/**
 * Find the longest source location that contains a path.
 * @param {Object} config The config.
 * @param {string} config.path An AEM-formatted supplied path.
 * @param {string[]} config.locations The candidate source locations.
 * @returns {string|undefined} The matching location, if any.
 */
export function findSourceLocation({ path, locations }) {
  const matches = locations.filter((location) => {
    const base = location.replace(/\/$/, '');
    return path === base || path.startsWith(`${base}/`);
  });
  return matches.sort((a, b) => b.length - a.length)[0];
}

/**
 * Joins a prefix and a path with exactly one separating slash, regardless
 * of whether `path` already has a leading slash.
 * @param {string} prefix - The path segment to prepend; any trailing slash
 *  is ignored.
 * @param {string} path - The path segment to append.
 * @returns {string} `prefix` and `path` joined by a single `/`.
 */
function joinPath(prefix, path) {
  const normalizedPrefix = prefix.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedPrefix}${normalizedPath}`;
}

/**
 * Create snapshot prefix path if snapshot is provided
 * @param {string|undefined} snapshot - The snapshot name
 * @returns {string} The snapshot prefix path
 */
export function createSnapshotPrefix(snapshot) {
  return snapshot ? `/.snapshots/${snapshot}` : '';
}

/**
 * Convert a path to DA and AEM formatted w/ optional destination language prefix
 *
 * @param config The path config.
 * @param config.path An AEM-formatted (no org, site, index, .html) supplied path.
 * @param config.sourcePrefix The prefix to remove.
 * @param config.destPrefix The prefix to attach.
 * @param config.snapshotPrefix The snapshot prefix to prepend to paths.
 */
export function convertPath({ path, sourcePrefix, destPrefix, snapshotPrefix = '' }) {
  const prefix = sourcePrefix === '/' || !sourcePrefix ? '' : sourcePrefix;

  // Ensure the path doesn't already have the prefix
  const plainBasePath = getBasePath({ prefix, path });

  // Determine if we need to add index
  const aemBasePath = plainBasePath.endsWith('/') ? `${plainBasePath}index` : plainBasePath;

  // Get the extension base path (for use with DA API)
  // We also use ext to determine things like conflict behavior
  const { path: daBasePath, ext } = getExtPath(aemBasePath);

  const paths = { daBasePath: `${snapshotPrefix}${daBasePath}`, aemBasePath: `${snapshotPrefix}${aemBasePath}`, ext };

  if (destPrefix) {
    paths.daDestPath = `${snapshotPrefix}${joinPath(destPrefix, daBasePath)}`;
    paths.aemDestPath = `${snapshotPrefix}${joinPath(destPrefix, aemBasePath)}`;
  }

  return paths;
}

/**
 * Compute the language-agnostic base path stored on a project url.
 * @param {Object} config The config.
 * @param {string} config.path The supplied AEM path.
 * @param {string} [config.defaultLocation] The default source language location.
 * @param {string[]} [config.sourceLocations] All configured source locations.
 * @returns {string} The AEM base path.
 */
export function getProjectBasePath({ path, defaultLocation, sourceLocations = [] }) {
  const sourcePrefix = findSourceLocation({ path, locations: sourceLocations }) || defaultLocation;
  return convertPath({ path, sourcePrefix }).aemBasePath;
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

    const { pathname } = new URL(window.location.href);

    if (pathname.includes('loc')) {
      window.location.hash = `/dashboard/${org}/${site}`;
    }

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
      const resp = await daFetch({ url: path });
      if (!resp.ok) return { error: 'Options not available.' };
      return resp.json();
    } catch {
      return { config: { data: [] } };
    }
  };

  // Attempt a site based config
  let options = await fetchConf(`${DA_ADMIN}/source/${org}/${site}${CONFIG_PATH}`);

  // Attempt an org based config
  if (options.error) {
    options = await fetchConf(`${DA_ADMIN}/source/${org}${CONFIG_PATH}`);
  }

  // Fallback to zero config defaults
  if (options.error) {
    const fallbackUrl = new URL('../connectors/google/translate.json', import.meta.url).href;
    options = await fetchConf(fallbackUrl);
  }

  CONFIG_CACHE = options;

  return options;
}

export function isSourceDetectEnabled(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

export function normalizeLocation(location) {
  const trimmed = String(location ?? '').trim().replace(/\/+$/, '');
  return trimmed || '/';
}

function getLocaleList(locales) {
  if (!locales) return [];
  const list = typeof locales === 'string' ? locales.split(',') : locales;
  return list
    .map((locale) => (typeof locale === 'string' ? locale : locale.code))
    .map((locale) => locale?.trim())
    .filter(Boolean)
    .map(normalizeLocation);
}

function buildSourceLang({ root, langs, defaultSourceLang }) {
  const byLocation = langs.find((lang) => (
    lang.location && normalizeLocation(lang.location) === root
  ));
  if (byLocation) return { name: byLocation.name, code: byLocation.code, location: root };

  const byLocale = langs.find((lang) => getLocaleList(lang.locales).includes(root));
  if (byLocale) return { name: `${byLocale.name} (${root})`, code: byLocale.code, location: root };

  return { name: root, code: defaultSourceLang?.code, location: root };
}

/**
 * Work out a project's source language from the folder its URLs live in.
 *
 * @param {Object} config
 * @param {Object[]} config.langs the language rows (location, source, locales, name, code)
 * @param {(string|Object)[]} config.urls paths, or objects with `suppliedPath` / `pathname`
 * @param {Object} [config.defaultSourceLang] the configured source language
 * @returns {{ sourceLang?: Object, detected?: boolean, error?: string }}
 *  `detected` is false when no URL matches a root and the configured source is returned.
 */
export function resolveSourceLang({ langs = [], urls = [], defaultSourceLang }) {
  const roots = [
    ...langs.flatMap((lang) => [lang.location, lang.source]),
    defaultSourceLang?.location,
  ]
    .filter(Boolean)
    .map(normalizeLocation)
    .filter((root) => root !== '/');
  const uniqueRoots = [...new Set(roots)].sort((a, b) => b.length - a.length);

  const matched = new Set();
  urls.forEach((url) => {
    const path = typeof url === 'string' ? url : (url.suppliedPath ?? url.pathname);
    if (!path) return;
    const root = findSourceLocation({
      path: path.replace(/\.(html|json)$/, ''),
      locations: uniqueRoots,
    });
    if (root) matched.add(root);
  });

  if (matched.size > 1) {
    return { error: `URLs come from more than one source root (${[...matched].join(', ')}). Create a separate project for each root.` };
  }

  if (matched.size === 0) return { sourceLang: defaultSourceLang, detected: false };

  const [root] = matched;
  return { sourceLang: buildSourceLang({ root, langs, defaultSourceLang }), detected: true };
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

async function fetchProject({ path, updates, updateDocTitle = true }) {
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

  const resp = await daFetch({ url: `${DA_ADMIN}/source${path}.json`, opts });
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
  if (updateDocTitle) {
    const { title } = PROJECT_CACHE[path];
    document.title = `${title} - DA Translation`;
  }

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

export async function loadProject({ path, updateDocTitle }) {
  return fetchProject({ path, updateDocTitle });
}
