import { AEM_ORIGIN, SNAPSHOT_SCHEDULER_URL } from '../../../public/utils/constants.js';
import { daFetch } from '../../../utils/daFetch.js';
import { mergeCopy, overwriteCopy } from '../../loc/project/index.js';
import { Queue } from '../../../public/utils/tree.js';

let org;
let site;

function formatError(resp) {
  if (resp.status === 401 || resp.status === 403) {
    return { error: 'You do not have privledges to take this snapshot action.' };
  }
  return { error: 'Not a valid project.' };
}

function formatResources(name, resources) {
  return resources.map((res) => ({
    path: res.path,
    aemPreview: `https://main--${site}--${org}.aem.page${res.path}`,
    url: `https://${name}--main--${site}--${org}.aem.reviews${res.path}`,
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

export async function deleteSnapshot(name, paths = ['/*']) {
  const results = await Promise.all(paths.map(async (path) => {
    const opts = { method: 'DELETE' };
    const resp = await daFetch(`${AEM_ORIGIN}/snapshot/${org}/${site}/main/${name}${path}`, opts);
    if (!resp.ok) return formatError(resp);
    return { success: resp.status };
  }));
  const firstError = results.find((result) => result.error);
  if (firstError) return firstError;
  return results[0];
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
    const deleteResult = await deleteSnapshot(name, removed);
    if (deleteResult.error) return deleteResult;
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
  }

  // The formatting of the response will be bulk job-like,
  // so shamelessly use the supplied paths as our turth.
  const toFormat = paths.map((path) => ({ path }));
  return formatResources(name, toFormat);
}

export async function copyManifest(name, resources, direction) {
  // The action to take
  const copyUrl = async (url) => {
    if (url.source.endsWith('.html')) {
      await mergeCopy(url, `Snapshot ${direction}`);
    } else {
      await overwriteCopy(url, `Snapshot ${direction}`);
    }
  };

  const urls = resources.reduce((acc, res) => {
    try {
      const url = new URL(res.aemPreview);

      const path = url.pathname.endsWith('/') ? `${url.pathname}index` : url.pathname;

      const extPath = path.endsWith('.json') ? path : `${path}.html`;

      const main = `/${org}/${site}${extPath}`;
      const fork = `/${org}/${site}/.snapshots/${name}${extPath}`;

      url.source = direction === 'fork' ? main : fork;
      url.destination = direction === 'fork' ? fork : main;

      acc.push(url);
    } catch {
      console.log('error making url from manifest path');
    }
    return acc;
  }, []);

  // Setup a new Queue with the copy function
  const queue = new Queue(copyUrl, 50);
  await Promise.all(urls.map((url) => queue.push(url)));
}

export async function updateScheduledPublish(snapshotId) {
  const adminURL = `${SNAPSHOT_SCHEDULER_URL}/schedule`;
  const body = {
    org,
    site,
    snapshotId,
  };

  const headers = {
    'content-type': 'application/json',
  };

  const resp = await fetch(`${adminURL}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const result = resp.headers.get('X-Error');
  return { status: resp.status, text: result };
}

export async function isRegisteredForSnapshotScheduler() {
  try {
    const adminURL = `${SNAPSHOT_SCHEDULER_URL}/register/${org}/${site}`;
    const resp = await fetch(adminURL);
    return resp.status === 200;
  } catch (error) {
    console.error('Error checking if registered for snapshot scheduler', error);
    return false;
  }
}

// Convert UTC date to local datetime-local format
export function formatLocalDate(utcDate) {
  if (!utcDate) return '';
  const d = new Date(utcDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}