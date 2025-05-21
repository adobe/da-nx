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

  // Split to the parts we care about
  const [view, org, site, ...projectParts] = path.split('/');

  const knownView = VIEWS.some((known) => view === known);

  if (!knownView) {
    // If there's no site or org, drop them to basics
    if (!(org && site)) {
      window.location.hash = '/basics';
      return { view: 'basics' };
    }

    window.location.hash = `/dashboard${path}`;
    return { org, site };
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
    const resp = await daFetch(path);
    if (!resp.ok) return { error: 'Options not available.' };
    return resp.json();
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

export async function fetchProject(path, detail) {
  // If there's a local cache at the location, use it.
  if (!detail && PROJECT_CACHE[path]) return PROJECT_CACHE[path];

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
    if (resp.status === 404) return { title: 'New project' };
    if (resp.status === 401 || resp.status === 403) {
      return { error: `Not authorized for: ${path}.` };
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

  return PROJECT_CACHE[path];
}

// All top level properties to persist
// const { view, org, site, title, options, langs, urls } = detail;
export async function saveProject(projPath, updates) {
  const { org, site } = updates;

  const path = projPath || `/.da/translation/active/${Date.now()}`;

  const href = `/${org}/${site}${path}`;

  const existing = await fetchProject(href);

  const ims = await loadIms();

  if (!existing.org) {
    existing.createdBy = ims.email;
  }

  existing.modifiedBy = ims.email;

  // Merge the existing json with the new details
  const combined = { ...existing, ...updates };

  const project = await fetchProject(href, combined);

  return { hash: `/${updates.view}${href}`, project };
}
