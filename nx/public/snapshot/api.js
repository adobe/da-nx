import { AEM_ORIGIN, DA_ORIGIN } from '../../../nx2/public/utils/constants.js';
import { createCopy } from '../loc/copy.js';

export const SNAPSHOT_SCHEDULER_URL = 'https://helix-snapshot-scheduler-prod.adobeaem.workers.dev';

export function appendHtmlUnlessExtension(pathname) {
  const basename = pathname.slice(pathname.lastIndexOf('/') + 1);
  return /\.[^./]+$/.test(basename) ? pathname : `${pathname}.html`;
}

const toSourcePath = (pathname) => appendHtmlUnlessExtension(pathname.endsWith('/') ? `${pathname}index` : pathname);

const runLimited = async (items, limit, task) => {
  const pending = [...items];
  const worker = async () => {
    while (pending.length) await task(pending.shift());
  };
  await Promise.all(Array.from({ length: Math.min(limit, pending.length) }, worker));
};

function pathnameAllowedForSnapshot(pathname) {
  if (pathname.endsWith('.html')
    || pathname.endsWith('.json')
    || pathname.endsWith('.svg')) return true;
  const basename = pathname.slice(pathname.lastIndexOf('/') + 1);
  return !/\.[^./]+$/.test(basename);
}

export function filterPaths(hrefs) {
  return hrefs.reduce((acc, href) => {
    try {
      const { pathname } = new URL(href);
      if (!pathnameAllowedForSnapshot(pathname)) return acc;
      acc.push(pathname.endsWith('.html') ? pathname.replace('.html', '') : pathname);
    } catch {
      // ignore invalid urls
    }
    return acc;
  }, []);
}

function comparePaths(first, second) {
  return {
    added: second.filter((item) => !first.includes(item)),
    removed: first.filter((item) => !second.includes(item)),
  };
}

function formatError(resp) {
  if (resp.status === 401 || resp.status === 403) {
    return { error: 'You do not have privledges to take this snapshot action.', status: resp.status };
  }
  const xErr = resp.headers?.get('X-Error');
  if (xErr) return { error: xErr, status: resp.status };
  return { error: `Unknown error. Status: ${resp.status}`, status: resp.status };
}

const guard = (fn) => async (args) => {
  try {
    return await fn(args);
  } catch (e) {
    return { error: e?.message || 'Network error', status: 0 };
  }
};

const getFirstSheet = (json) => {
  if (json[':type'] !== 'multi-sheet') return json.data;
  return json[Object.keys(json)[0]]?.data;
};

function createDaSource({ fetch, daOrigin }) {
  const url = (path) => `${daOrigin}/source${path}`;
  return {
    get: (path) => fetch(url(path)),
    getMetadata: (path) => fetch(url(path), { method: 'HEAD' }),
    delete: (path) => fetch(url(path), { method: 'DELETE' }),
  };
}

/**
 * Snapshot operations for one site. Every request goes through `fetch(url, opts)`,
 * which must add the user's auth headers (e.g. the DA SDK's `actions.daFetch`).
 * `source` optionally replaces DA source reads/deletes (`get`, `getMetadata`, `delete`
 * taking `/org/site/path`) and HTML saves (`save({ org, site, path, body })`) used by copies.
 * See docs/snapshot-api.md.
 */
export function createSnapshotApi({
  fetch, org, site, source, daOrigin = DA_ORIGIN, pollInterval = 750,
}) {
  if (typeof fetch !== 'function') throw new TypeError('createSnapshotApi requires fetch');

  const src = source || createDaSource({ fetch, daOrigin });
  const base = `${AEM_ORIGIN}/snapshot/${org}/${site}/main`;
  const copy = createCopy({ fetch, daOrigin, saveSource: source?.save });

  const formatResources = (name, resources) => resources.map((res) => ({
    path: res.path,
    aemPreview: `https://main--${site}--${org}.aem.page${res.path}`,
    url: `https://${name}--main--${site}--${org}.aem.reviews${res.path}`,
    aemLive: `https://main--${site}--${org}.aem.live${res.path}`,
    daEdit: `https://da.live/edit#/${org}/${site}${res.path}`,
    daSnapshotEdit: `https://da.live/edit#/${org}/${site}/.snapshots/${name}${res.path}`,
  }));

  const pollJob = async (jobHref) => {
    while (true) {
      const resp = await fetch(jobHref);
      if (!resp.ok) return formatError(resp);
      const job = await resp.json();
      if (job.state === 'stopped') {
        if (job.cancelled || job.error) return { error: job.error || 'The job was cancelled', status: 500 };
        return { success: true };
      }
      await new Promise((resolve) => { setTimeout(resolve, pollInterval); });
    }
  };

  const bulk = async (name, body) => {
    const opts = {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    };
    const resp = await fetch(`${base}/${name}/*`, opts);
    if (!resp.ok && !(body.delete && resp.status === 404)) return formatError(resp);
    if (resp.status === 202) {
      const { links } = await resp.json();
      if (links?.self) return pollJob(links.self);
    }
    return { success: true };
  };

  const readManifest = async (name, resp) => {
    if (!resp.ok) return formatError(resp);
    const { manifest } = await resp.json();
    manifest.resources = formatResources(name, manifest.resources);
    return manifest;
  };

  const list = async () => {
    const resp = await fetch(base);
    if (!resp.ok) return formatError(resp);
    const json = await resp.json();
    return { snapshots: json.snapshots.map((name) => ({ org, site, name })) };
  };

  const getManifest = async ({ name }) => readManifest(name, await fetch(`${base}/${name}`));

  const saveManifest = async ({ name, manifest }) => {
    const opts = { method: 'POST' };
    if (manifest) {
      opts.body = JSON.stringify(manifest);
      opts.headers = { 'Content-Type': 'application/json' };
    }
    return readManifest(name, await fetch(`${base}/${name}`, opts));
  };

  const review = async ({ name, state }) => {
    const resp = await fetch(`${base}/${name}?review=${state}&keepResources=true`, { method: 'POST' });
    if (!resp.ok) return formatError(resp);
    return { success: true };
  };

  const addPaths = ({ name, paths }) => bulk(name, { paths });

  const removePaths = ({ name, paths = ['/*'] }) => bulk(name, { delete: true, paths });

  const updatePaths = async ({ name, currPaths, hrefs }) => {
    const paths = filterPaths(hrefs);
    const { removed, added } = comparePaths(currPaths, paths);
    if (removed.length) {
      const result = await removePaths({ name, paths: removed });
      if (!result.success) return result;
    }
    if (added.length) {
      const result = await addPaths({ name, paths: added });
      if (!result.success) return result;
    }
    return formatResources(name, paths.map((path) => ({ path })));
  };

  const deleteSnapshot = async ({ name, paths = [] }) => {
    const result = await removePaths({ name, paths });
    if (!result.success) return result;
    const srcResp = await src.delete(`/${org}/${site}/.snapshots/${name}`);
    if (!srcResp.ok && srcResp.status !== 404) return formatError(srcResp);
    const resp = await fetch(`${base}/${name}`, { method: 'DELETE' });
    if (!resp.ok) return formatError(resp);
    return { success: true };
  };

  const directCopy = async (url) => {
    const srcResp = await src.get(url.source);
    if (!srcResp.ok) {
      url.status = 'error';
      return;
    }
    const data = await srcResp.arrayBuffer();
    const header = srcResp.headers.get('content-type')?.split(';')[0]?.trim() || '';
    const fallback = url.destination.includes('.json') ? 'application/json' : 'application/octet-stream';
    const type = !header || header === 'text/plain' ? fallback : header;
    const body = new FormData();
    body.append('data', new Blob([data], { type }));
    const resp = await fetch(`${daOrigin}/source${url.destination}`, { method: 'POST', body });
    url.status = resp.ok ? 'success' : 'error';
  };

  // 'fork' copies main into the snapshot; 'promote' copies the snapshot back to main.
  const copyResources = async ({
    name, resources, direction, mode = 'merge',
  }) => {
    const copyUrl = async (url) => {
      if (!url.source.endsWith('.html')) {
        await directCopy(url);
        return;
      }
      if (mode === 'overwrite') {
        await copy.overwriteCopy(url, `Snapshot ${direction}`, { recordBaseline: false });
        return;
      }
      const labels = direction === 'fork'
        ? { labelLocal: 'Snapshot', labelUpstream: 'Main' }
        : { labelLocal: 'Main', labelUpstream: 'Snapshot' };
      await copy.mergeCopy(url, `Snapshot ${direction}`, { ...labels, recordBaseline: false });
    };

    const safeCopyUrl = async (url) => {
      try {
        await copyUrl(url);
      } catch (e) {
        url.status = 'error';
        url.error = e?.message;
      }
    };

    const urls = resources.reduce((acc, res) => {
      try {
        const url = new URL(res.aemPreview);
        const extPath = toSourcePath(url.pathname);
        const main = `/${org}/${site}${extPath}`;
        const fork = `/${org}/${site}/.snapshots/${name}${extPath}`;
        url.source = direction === 'fork' ? main : fork;
        url.destination = direction === 'fork' ? fork : main;
        url.path = res.path;
        acc.push(url);
      } catch {
        // eslint-disable-next-line no-console
        console.log('error making url from manifest path');
      }
      return acc;
    }, []);

    await runLimited(urls, 50, safeCopyUrl);
    return urls;
  };

  const copyPage = async ({
    name, path, direction, mode,
  }) => {
    if (typeof path !== 'string' || !path.startsWith('/') || !['fork', 'promote'].includes(direction)) {
      return { error: 'A page path starting with / and a direction of fork or promote are required', status: 400 };
    }
    const [url] = await copyResources({
      name, resources: formatResources(name, [{ path }]), direction, mode,
    });
    if (!url) return { error: 'Invalid path', status: 400 };
    if (url.status === 'success') return { status: url.status };
    return { status: 'error', error: url.error || 'The page could not be copied' };
  };

  const hasSnapshotSource = async ({ name, path }) => {
    try {
      const resp = await src.getMetadata(`/${org}/${site}/.snapshots/${name}${toSourcePath(path)}`);
      if (resp.ok) return true;
      return resp.status === 404 ? false : null;
    } catch {
      return null;
    }
  };

  const updateSchedule = async ({ name, approved = false, userId }) => {
    const body = JSON.stringify({
      org, site, snapshotId: name, approved, userId,
    });
    const opts = { method: 'POST', headers: { 'content-type': 'application/json' }, body };
    const resp = await fetch(`${SNAPSHOT_SCHEDULER_URL}/schedule`, opts);
    return { status: resp.status, text: resp.headers.get('X-Error') };
  };

  const isRegistered = async () => {
    try {
      const resp = await fetch(`${SNAPSHOT_SCHEDULER_URL}/register/${org}/${site}`);
      return resp.status === 200;
    } catch {
      return false;
    }
  };

  const getPublishPermission = async ({ path = '/' } = {}) => {
    try {
      const resp = await fetch(`${AEM_ORIGIN}/status/${org}/${site}/main${path}`);
      if (!resp.ok) return false;
      const json = await resp.json();
      return json.live?.permissions?.includes('write') || false;
    } catch {
      return false;
    }
  };

  const loadConfig = (() => {
    const cache = {};
    const fetchConfig = async (path) => {
      const resp = await fetch(`${daOrigin}/config${path}/`);
      return resp.ok ? resp.json() : {};
    };
    return async () => {
      cache.promise ??= Promise.all([`/${org}`, `/${org}/${site}`].map(fetchConfig));
      const sheets = await cache.promise;
      return sheets.flatMap((json) => getFirstSheet(json) || [])
        .reduce((acc, { key, value }) => ({ ...acc, [key]: value }), {});
    };
  })();

  const getLaunchPermission = async () => {
    try {
      const config = await loadConfig();
      return config['snapshot.launch'] === 'true';
    } catch {
      return false;
    }
  };

  return {
    list: guard(list),
    getManifest: guard(getManifest),
    saveManifest: guard(saveManifest),
    review: guard(review),
    addPaths: guard(addPaths),
    removePaths: guard(removePaths),
    updatePaths: guard(updatePaths),
    deleteSnapshot: guard(deleteSnapshot),
    copyResources,
    hasSnapshotSource,
    copyPage: guard(copyPage),
    updateSchedule: guard(updateSchedule),
    isRegistered,
    getPublishPermission,
    getLaunchPermission,
  };
}
