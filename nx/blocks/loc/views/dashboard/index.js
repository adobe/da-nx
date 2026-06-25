import { source, fromPath } from '../../../../../nx2/utils/api.js';

const TRANSLATION_PATH_ACTIVE = 'translation/active';
const TRANSLATION_PATH_ARCHIVE = 'translation/archive';

/**
 * Fetch project JSON from the server. Routes through the Helix-6-aware
 * `source.get` so upgraded sites read from AEM and legacy sites from DA.
 * @param {string} projectPath - Full project path, e.g. '/org/site/.da/translation/active/1.json'
 * @returns {Promise<{ok: boolean, status: number, data?: Object}>}
 */
export async function fetchProject(projectPath) {
  const resp = await source.get(projectPath);

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

  const newTimestamp = Date.now();
  // Replace the last path segment (timestamp) with the new timestamp
  const newPath = path.substring(0, path.lastIndexOf('/') + 1) + newTimestamp;

  await source.save(`${newPath}.json`, { body: JSON.stringify(newProject) });

  // Return just the path and timestamp for the new project
  return { path: newPath, lastModified: newTimestamp, newProject };
}

export async function archiveProject(project) {
  const { path } = project;

  // `path` is a full /org/site/... path; source.move takes org/site-relative paths.
  const { org, site, path: relPath } = fromPath(path);
  const relDest = relPath.replace(TRANSLATION_PATH_ACTIVE, TRANSLATION_PATH_ARCHIVE);
  await source.move({ org, site, path: `${relPath}.json`, destination: `${relDest}.json` });

  const newPath = path.replace(TRANSLATION_PATH_ACTIVE, TRANSLATION_PATH_ARCHIVE);
  return newPath;
}
