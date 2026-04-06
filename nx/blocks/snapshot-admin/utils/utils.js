import { AEM_ORIGIN, DA_ORIGIN } from '../../../public/utils/constants.js';
import { daFetch, initIms } from '../../../utils/daFetch.js';
import { mergeCopy, overwriteCopy } from '../../loc/project/index.js';
import { Queue } from '../../../public/utils/tree.js';

const SNAPSHOT_SCHEDULER_URL = 'https://helix-snapshot-scheduler-prod.adobeaem.workers.dev';

let org;
let site;

function formatError(resp) {
  if (resp.status === 401 || resp.status === 403) {
    return { error: 'You do not have privledges to take this snapshot action.' };
  }
  const xErr = resp.headers.get('X-Error');
  if (xErr) return { error: xErr };
  return { error: `Unknown error. Status: ${resp.status}` };
}

async function pollJob(jobUrl, interval = 750) {
  while (true) {
    const resp = await daFetch(jobUrl);
    if (!resp.ok) return;
    const job = await resp.json();
    if (job.state === 'stopped') return;
    await new Promise((resolve) => { setTimeout(resolve, interval); });
  }
}

function formatResources(name, resources) {
  return resources.map((res) => ({
    path: res.path,
    aemPreview: `https://main--${site}--${org}.aem.page${res.path}`,
    url: `https://${name}--main--${site}--${org}.aem.reviews${res.path}`,
    aemLive: `https://main--${site}--${org}.aem.live${res.path}`,
    daEdit: `https://da.live/edit#/${org}/${site}${res.path}`,
    daSnapshotEdit: `https://da.live/edit#/${org}/${site}/.snapshots/${name}${res.path}`,
  }));
}

function filterPaths(hrefs) {
  return hrefs.reduce((acc, href) => {
    try {
      const { pathname } = new URL(href);
      acc.push(pathname.endsWith('.html') ? pathname.replace('.html', '') : pathname);
    } catch {
      // do nothing
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

export async function saveManifest(name, manifestToSave) {
  const opts = { method: 'POST' };

  if (manifestToSave) {
    opts.body = JSON.stringify(manifestToSave);
    opts.headers = { 'Content-Type': 'application/json' };
  }

  const resp = await daFetch(`${AEM_ORIGIN}/snapshot/${org}/${site}/main/${name}`, opts);
  if (!resp.ok) return formatError(resp);
  const { manifest } = await resp.json();
  manifest.resources = formatResources(name, manifest.resources);
  return manifest;
}

export async function reviewSnapshot(name, state) {
  const opts = { method: 'POST' };
  // Review status
  const review = `?review=${state}&keepResources=true`;
  const resp = await daFetch(`${AEM_ORIGIN}/snapshot/${org}/${site}/main/${name}${review}`, opts);
  if (!resp.ok) return formatError(resp);
  return { success: true };
}

export async function fetchManifest(name) {
  const resp = await daFetch(`${AEM_ORIGIN}/snapshot/${org}/${site}/main/${name}`);
  if (!resp.ok) return formatError(resp);
  const { manifest } = await resp.json();
  manifest.resources = formatResources(name, manifest.resources);
  return manifest;
}

export async function fetchSnapshots() {
  const resp = await daFetch(`${AEM_ORIGIN}/snapshot/${org}/${site}/main`);
  if (!resp.ok) return formatError(resp);
  const json = await resp.json();

  const snapshots = json.snapshots.map((snapshot) => (
    { org, site, name: snapshot }
  ));

  return { snapshots };
}

async function deleteDaSnapshotDirectory(name) {
  const opts = { method: 'DELETE' };
  const resp = await daFetch(`${DA_ORIGIN}/source/${org}/${site}/.snapshots/${name}`, opts);
  if (!resp.ok) return formatError(resp);
  return { success: true };
}

export async function deleteSnapshotFiles(name, paths = ['/*']) {
  const opts = {
    method: 'POST',
    body: JSON.stringify({ delete: true, paths }),
    headers: { 'Content-Type': 'application/json' },
  };
  const resp = await daFetch(`${AEM_ORIGIN}/snapshot/${org}/${site}/main/${name}/*`, opts);
  if (!resp.ok && resp.status !== 404) return formatError(resp);

  // Handle async job (202) by polling until complete
  if (resp.status === 202) {
    const { links } = await resp.json();
    if (links?.self) {
      await pollJob(links.self);
    }
  }

  return { success: true };
}

export async function deleteSnapshot(name, paths = []) {
  const result = await deleteSnapshotFiles(name, paths);
  if (!result.success) return result;

  // delete any files in the .snapshots directory
  deleteDaSnapshotDirectory(name);

  // once all resources are deleted, delete the snapshot
  const opts = { method: 'DELETE' };
  const resp = await daFetch(`${AEM_ORIGIN}/snapshot/${org}/${site}/main/${name}`, opts);
  if (!resp.ok) return formatError(resp);
  return { success: true };
}

export function setOrgSite(suppliedOrg, suppliedSite) {
  org = suppliedOrg;
  site = suppliedSite;
}

export async function updatePaths(name, currPaths, editedHrefs) {
  const paths = filterPaths(editedHrefs);
  const { removed, added } = comparePaths(currPaths, paths);

  // Handle deletes
  if (removed.length > 0) {
    const deleteResult = await deleteSnapshotFiles(name, removed);
    if (!deleteResult.success) return deleteResult;
  }

  // Handle adds
  if (added.length > 0) {
    const opts = {
      method: 'POST',
      body: JSON.stringify({ paths: added }),
      headers: { 'Content-Type': 'application/json' },
    };

    // This is technically a bulk ops request
    const resp = await daFetch(`${AEM_ORIGIN}/snapshot/${org}/${site}/main/${name}/*`, opts);
    if (!resp.ok) return formatError(resp);

    // Handle async job (202) by polling until complete
    if (resp.status === 202) {
      const { links } = await resp.json();
      if (links?.self) {
        await pollJob(links.self);
      }
    }
  }

  // The formatting of the response will be bulk job-like,
  // so shamelessly use the supplied paths as our turth.
  const toFormat = paths.map((path) => ({ path }));
  return formatResources(name, toFormat);
}

export function appendHtmlUnlessExtension(pathname) {
  const basename = pathname.slice(pathname.lastIndexOf('/') + 1);
  return /\.[^./]+$/.test(basename) ? pathname : `${pathname}.html`;
}

export async function copyManifest(name, resources, direction, mode = 'merge') {
  const copyUrl = async (url) => {
    if (mode === 'overwrite' || !url.source.endsWith('.html')) {
      await overwriteCopy(url, `Snapshot ${direction}`);
    } else {
      const labels = (direction === 'fork')
        ? { labelLocal: 'Snapshot', labelUpstream: 'Main' }
        : { labelLocal: 'Main', labelUpstream: 'Snapshot' };
      await mergeCopy(url, `Snapshot ${direction}`, labels);
    }
  };

  const urls = resources.reduce((acc, res) => {
    try {
      const url = new URL(res.aemPreview);

      const path = url.pathname.endsWith('/') ? `${url.pathname}index` : url.pathname;

      const extPath = appendHtmlUnlessExtension(path);

      const main = `/${org}/${site}${extPath}`;
      const fork = `/${org}/${site}/.snapshots/${name}${extPath}`;

      url.source = direction === 'fork' ? main : fork;
      url.destination = direction === 'fork' ? fork : main;

      acc.push(url);
    } catch {
      // eslint-disable-next-line no-console
      console.log('error making url from manifest path');
    }
    return acc;
  }, []);

  // Setup a new Queue with the copy function
  const queue = new Queue(copyUrl, 50);
  await Promise.all(urls.map((url) => queue.push(url)));
}

export async function updateSchedule(snapshotId, approved = false) {
  const adminURL = `${SNAPSHOT_SCHEDULER_URL}/schedule`;
  const imsProfile = await initIms();
  const body = {
    org,
    site,
    snapshotId,
    approved,
    userId: imsProfile?.email,
  };
  const headers = { 'content-type': 'application/json' };
  const resp = await daFetch(`${adminURL}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const result = resp.headers.get('X-Error');
  return { status: resp.status, text: result };
}

export async function getUserPublishPermission(path = '/') {
  try {
    // Use the admin.hlx.page status endpoint to check permissions
    const statusURL = `https://admin.hlx.page/status/${org}/${site}/main${path}`;
    const resp = await daFetch(statusURL);
    if (!resp.ok) return false;

    const json = await resp.json();
    // Check if 'write' is in the live.permissions array - this indicates publish permission
    return json.live?.permissions?.includes('write') || false;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error checking user publish permission', error);
    return false;
  }
}

export async function isRegistered() {
  try {
    const adminURL = `${SNAPSHOT_SCHEDULER_URL}/register/${org}/${site}`;
    const resp = await daFetch(adminURL);
    return resp.status === 200;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error checking if registered for snapshot scheduler', error);
    return false;
  }
}

const fetchDaConfigs = (() => {
  const configCache = {};

  const fetchConfig = async (pathname) => {
    const resp = await daFetch(`${DA_ORIGIN}/config${pathname}/`);
    if (!resp.ok) return { error: `Error loading ${pathname}`, status: resp.status };
    return resp.json();
  };

  return ({ org: _org, site: _site }) => {
    // Set the org config promise if it does not exist
    configCache[`/${_org}`] ??= fetchConfig(`/${_org}`);

    if (_site) {
      // Set the _site config promise if it does not exist
      configCache[`/${_org}/${_site}`] ??= fetchConfig(`/${_org}/${_site}`);
    }

    // return array of cached configs (_org = 0, _site = 1)
    const configs = [configCache[`/${_org}`]];
    if (_site) configs.push(configCache[`/${_org}/${_site}`]);

    return configs;
  };
})();

export const getSheetByIndex = (json, index = 0) => {
  if (json[':type'] !== 'multi-sheet') {
    return json.data;
  }
  return json[Object.keys(json)[index]]?.data;
};

export const getFirstSheet = (json) => getSheetByIndex(json, 0);

const getConfig = async (_org, _site) => {
  const configs = await Promise.all(fetchDaConfigs({ org: _org, site: _site }));
  return configs.flatMap((c) => getFirstSheet(c) || [])
    .reduce((o, entry) => { o[entry.key] = entry.value; return o; }, {});
};

export async function checkSnapshotSource(name, path) {
  const extPath = appendHtmlUnlessExtension(path);
  const url = `${DA_ORIGIN}/source/${org}/${site}/.snapshots/${name}${extPath}`;
  try {
    const resp = await daFetch(url, { method: 'HEAD' });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function fetchLaunchPermission() {
  try {
    const config = await getConfig(org, site);
    return config['snapshot.launch'] === 'true';
  } catch {
    return false;
  }
}

// Convert UTC date to local datetime-local format
export function formatLocalDate(utcDate) {
  if (!utcDate) return '';
  const d = new Date(utcDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
