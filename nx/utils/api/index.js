import { DA_ORIGIN } from '../../public/utils/constants.js';
import DaLegacyApi from './da-legacy.js';
import DaHelix6Api from './da-helix6.js';

export { DaLegacyApi, DaHelix6Api };

const HELIX6_ORIGIN = 'https://api.aem.live';
const SIDEKICK_PROBE = (org, site) => `https://admin.hlx.page/sidekick/${org}/${site}/main/config.json`;

// key → 'legacy' | 'helix6'
const versionCache = new Map();
// key → DaApi instance (legacy or helix6)
const apiCache = new Map();

let globalOverride;
function readOverride() {
  if (globalOverride !== undefined) return globalOverride;
  try {
    const params = new URL(window.location.href).searchParams;
    // nx2 (the next-gen nx) implies helix6 — opting into the new shell opts
    // you into the new admin API.
    const nx2 = params.get('nxver') !== null;
    const adminFlag = params.get('da-admin') === 'hlx6'
      || localStorage.getItem('da-admin') === 'hlx6';
    globalOverride = (nx2 || adminFlag) ? 'helix6' : null;
  } catch {
    globalOverride = null;
  }
  return globalOverride;
}

function keyFor(org, site) {
  if (!org) return '';
  return site ? `${org}/${site}` : org;
}

function makeApi(version) {
  if (version === 'helix6') return new DaHelix6Api(HELIX6_ORIGIN);
  return new DaLegacyApi(DA_ORIGIN);
}

async function probeSite(org, site) {
  try {
    const resp = await fetch(SIDEKICK_PROBE(org, site), { method: 'HEAD' });
    return resp.headers.get('x-api-upgrade-available') === 'true' ? 'helix6' : 'legacy';
  } catch {
    return 'legacy';
  }
}

// Public: synchronously read what we already know. Returns 'legacy' | 'helix6' | undefined.
export function knownApiVersion(org, site) {
  if (readOverride() === 'helix6') return 'helix6';
  const key = keyFor(org, site);
  if (versionCache.has(key)) return versionCache.get(key);
  // If we know the site, the org inherits.
  if (site && versionCache.get(`${org}/${site}`) === 'helix6') return 'helix6';
  return undefined;
}

// Public: third parties (e.g. an existing sidekick GET) can seed the cache.
export function registerApiVersion(org, site, version) {
  if (!org || !version) return;
  const key = keyFor(org, site);
  versionCache.set(key, version);
  if (version === 'helix6' && site) {
    // Org-level inherits if any site is helix6.
    if (versionCache.get(org) !== 'helix6') versionCache.set(org, 'helix6');
  }
  // Invalidate cached api instance so the next read picks up the new version.
  apiCache.delete(key);
}

// Public async: returns a settled DaApi for (org, site). Defaults to legacy at
// org level until we learn otherwise.
export async function resolveDaApi(org, site) {
  const key = keyFor(org, site);
  if (apiCache.has(key)) return apiCache.get(key);

  let version = knownApiVersion(org, site);
  if (!version) {
    if (readOverride() === 'helix6') {
      version = 'helix6';
    } else if (site) {
      version = await probeSite(org, site);
    } else {
      version = 'legacy';
    }
    versionCache.set(key, version);
  }

  const api = makeApi(version);
  apiCache.set(key, api);
  return api;
}

// Public sync: an immediately-usable api. If we don't yet know, returns legacy.
// Use `resolveDaApi` to await detection at navigation time.
export function getDaApi(org, site) {
  const key = keyFor(org, site);
  if (apiCache.has(key)) return apiCache.get(key);
  const version = knownApiVersion(org, site) ?? 'legacy';
  const api = makeApi(version);
  apiCache.set(key, api);
  return api;
}

function parseOrgSite(path) {
  const parts = (path || '').split('/').filter((p) => p !== '');
  return { org: parts[0], site: parts[1] };
}

function pathRouted(method) {
  return function pathRoutedFn(path, ...rest) {
    const { org, site } = parseOrgSite(path);
    const api = getDaApi(org, site);
    return api[method](path, ...rest);
  };
}

// Path-routed singleton: every method extracts `{org, site}` from the path and
// dispatches to the right (legacy or helix6) implementation. Call sites use
// this exclusively — they don't need to know which API is active.
export const daApi = {
  get apiVersion() { return readOverride() === 'helix6' ? 'helix6' : 'mixed'; },
  // identity helpers, computed against the current path
  origin(path) { return getDaApi(...Object.values(parseOrgSite(path))).origin; },
  isHelix6(path) { return getDaApi(...Object.values(parseOrgSite(path))).apiVersion === 'helix6'; },

  // URL builders
  getSourceUrl: pathRouted('getSourceUrl'),
  getConfigUrl: pathRouted('getConfigUrl'),
  getListUrl: pathRouted('getListUrl'),
  getVersionListUrl: pathRouted('getVersionListUrl'),
  getVersionSourceUrl: pathRouted('getVersionSourceUrl'),

  // Operations
  getSource: pathRouted('getSource'),
  saveSource: pathRouted('saveSource'),
  deleteSource: pathRouted('deleteSource'),
  getConfig: pathRouted('getConfig'),
  saveConfig: pathRouted('saveConfig'),
  getList: pathRouted('getList'),
  getVersionList: pathRouted('getVersionList'),
  getVersion: pathRouted('getVersion'),
  createVersion: pathRouted('createVersion'),

  // move/copy take (srcPath, destPath, ...) — route by srcPath.
  move(srcPath, destPath, continuationToken) {
    const { org, site } = parseOrgSite(srcPath);
    return getDaApi(org, site).move(srcPath, destPath, continuationToken);
  },
  copy(srcPath, destPath, continuationToken) {
    const { org, site } = parseOrgSite(srcPath);
    return getDaApi(org, site).copy(srcPath, destPath, continuationToken);
  },
};

// Dev/test hook
export function resetApiCache() {
  versionCache.clear();
  apiCache.clear();
  globalOverride = undefined;
}
