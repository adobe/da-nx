import { daFetch, source } from '../../../../nx2/utils/api.js';
import { loadIms } from '../../../../nx2/utils/ims.js';
import {
  createSnapshotApi, appendHtmlUnlessExtension, SNAPSHOT_SCHEDULER_URL,
} from '../../../public/snapshot/api.js';

export { appendHtmlUnlessExtension };

const adminSource = {
  get: (path) => source.get(path),
  getMetadata: (path) => source.getMetadata(path),
  delete: (path) => source.delete(path),
  save: (args) => source.save(args),
};

const createApi = (org, site) => createSnapshotApi({
  fetch: (url, opts) => daFetch({ url, opts }),
  org,
  site,
  source: adminSource,
});

let api = createApi();
const current = {};

export function setOrgSite(org, site) {
  Object.assign(current, { org, site });
  api = createApi(org, site);
}

export const saveManifest = (name, manifest) => api.saveManifest({ name, manifest });

export const reviewSnapshot = (name, state) => api.review({ name, state });

export const fetchManifest = (name) => api.getManifest({ name });

export function createQueue(limit = 4) {
  let active = 0;
  const waiting = [];
  const next = () => {
    if (active >= limit || !waiting.length) return;
    active += 1;
    const { task, resolve, reject } = waiting.shift();
    task().then(resolve, reject).finally(() => {
      active -= 1;
      next();
    });
  };
  return (task) => new Promise((resolve, reject) => {
    waiting.push({ task, resolve, reject });
    next();
  });
}

const prefetchQueue = createQueue(4);

export const queueManifest = (name) => prefetchQueue(() => fetchManifest(name));

export const queueSourceCheck = ({ name, path }) => prefetchQueue(
  () => api.hasSnapshotSource({ name, path }),
);

export function getScheduledPublish(manifest) {
  const scheduled = manifest?.metadata?.scheduledPublish;
  if (!scheduled) return undefined;
  const date = new Date(scheduled);
  if (Number.isNaN(date.getTime()) || date <= new Date()) return undefined;
  return date;
}

export const fetchSnapshots = () => api.list();

export const deleteSnapshotFiles = (name, paths) => api.removePaths({ name, paths });

async function deleteSchedule(name) {
  try {
    const { accessToken } = await loadIms();
    // daFetch does not send the IMS token to the scheduler, but its DELETE route needs it.
    const headers = { Authorization: `Bearer ${accessToken?.token}` };
    const url = `${SNAPSHOT_SCHEDULER_URL}/schedule/snapshot/${current.org}/${current.site}/${name}`;
    const resp = await daFetch({ url, opts: { method: 'DELETE', headers } });
    if (!resp.ok && resp.status !== 404) {
      // eslint-disable-next-line no-console
      console.warn(`Could not remove schedule for snapshot ${name}. Status: ${resp.status}`);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Could not remove schedule for snapshot ${name}`, error);
  }
}

export async function deleteSnapshot(name, paths) {
  const result = await api.deleteSnapshot({ name, paths });
  if (result.success) await deleteSchedule(name);
  return result;
}

export const updatePaths = (name, currPaths, hrefs) => api.updatePaths({ name, currPaths, hrefs });

export const copyManifest = (name, resources, direction, mode) => api.copyResources({
  name, resources, direction, mode,
});

export async function updateSchedule(name, approved = false) {
  const imsProfile = await loadIms();
  return api.updateSchedule({ name, approved, userId: imsProfile?.email });
}

export const getUserPublishPermission = (path) => api.getPublishPermission({ path });

export const isRegistered = () => api.isRegistered();

export const checkSnapshotSource = (name, path) => api.hasSnapshotSource({ name, path });

export const fetchLaunchPermission = () => api.getLaunchPermission();

export const getSheetByIndex = (json, index = 0) => {
  if (json[':type'] !== 'multi-sheet') {
    return json.data;
  }
  return json[Object.keys(json)[index]]?.data;
};

export const getFirstSheet = (json) => getSheetByIndex(json, 0);

// Convert UTC date to local datetime-local format
export function formatLocalDate(utcDate) {
  if (!utcDate) return '';
  const d = new Date(utcDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
