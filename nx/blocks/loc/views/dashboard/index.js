import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { daFetch } from '../../../../utils/daFetch.js';

const TRANSLATION_PATH_ACTIVE = 'translation/active';
const TRANSLATION_PATH_ARCHIVE = 'translation/archive';

/**
 * Fetch project JSON from the server
 * @param {string} projectPath - The project path (e.g., '/.da/translation/active/123456.json')
 * @param {Object} options - Optional fetch options
 * @returns {Promise<{ok: boolean, status: number, data?: Object}>}
 */
export async function fetchProject(projectPath, options = {}) {
  const resp = await daFetch(`${DA_ORIGIN}/source${projectPath}`, options);

  if (!resp.ok) {
    return { ok: false, status: resp.status, statusText: resp.statusText };
  }

  const data = await resp.json();
  return { ok: true, status: resp.status, statusText: resp.statusText, data };
}

export async function copyProject(project, email) {
  const { path } = project;

  const result = await fetchProject(`${path}.json`);
  if (!result.ok) {
    throw new Error(`Error fetching project: ${result.status}`);
  }

  const json = result.data;
  if (json.langs) {
    json.langs.forEach((lang) => {
      delete lang.translation;
      delete lang.copy;
      delete lang.rollout;
    });
  }
  const newProject = {
    org: json.org,
    site: json.site,
    snapshot: json.snapshot,
    title: `${json.title}-copy`,
    createdBy: email,
    modifiedBy: email,
    view: 'basics',
    urls: json.urls,
    options: json.options,
    langs: json.langs,
  };

  const body = new FormData();
  const data = new Blob([JSON.stringify(newProject)], { type: 'application/json' });
  body.append('data', data);

  const newTimestamp = Date.now();
  // Replace the last path segment (timestamp) with the new timestamp
  const newPath = path.substring(0, path.lastIndexOf('/') + 1) + newTimestamp;

  await daFetch(`${DA_ORIGIN}/source${newPath}.json`, { body, method: 'POST' });

  // Return just the path and timestamp for the new project
  return { path: newPath, lastModified: newTimestamp, newProject };
}

export async function archiveProject(project) {
  const { path } = project;

  const formData = new FormData();
  const newPath = path.replace(TRANSLATION_PATH_ACTIVE, TRANSLATION_PATH_ARCHIVE);
  formData.append('destination', `${newPath}.json`);
  const opts = { body: formData, method: 'POST' };
  await daFetch(`${DA_ORIGIN}/move${path}.json`, opts);
  return newPath;
}
