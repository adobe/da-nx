import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { formatDate } from '../../utils/utils.js';

function getActionStatus(actionableLangs, action) {
  const langsStatus = actionableLangs.reduce((acc, lang) => {
    const status = lang[action]?.status || 'not started';
    acc.push(status);
    return acc;
  }, []);
  const successTotal = langsStatus.filter((status) => status === 'complete').length;
  const notStartedTotal = langsStatus.filter((status) => status === 'not started').length;
  const cancelledTotal = langsStatus.filter((status) => status === 'cancelled').length;
  const waitingTotal = langsStatus.filter((status) => status === 'waiting').length;
  if (successTotal === actionableLangs.length) return 'complete';
  if (notStartedTotal === actionableLangs.length) return 'not started';
  if (cancelledTotal === actionableLangs.length - waitingTotal) return 'cancelled';
  return 'in progress';
}

function getRolloutStatus(langs) {
  // Anything with locales is assumed to need rollout
  const actionableLangs = langs.filter((lang) => lang.locales);
  if (!actionableLangs.length) return null;
  return getActionStatus(actionableLangs, 'rollout');
}

function getTranslationStatus(langs) {
  const actionableLangs = langs.filter((lang) => lang.action === 'translate');
  if (!actionableLangs.length) return null;
  return getActionStatus(actionableLangs, 'translation');
}

function getLocalesTotal(langs) {
  return langs.reduce((acc, lang) => {
    if (lang.locales.length) {
      const total = acc + lang.locales.length;
      return total;
    }
    return acc;
  }, 0);
}

export async function fetchProjectList(org, site) {
  const resp = await daFetch(`${DA_ORIGIN}/list/${org}/${site}/.da/translation/active`);
  if (!resp.ok) {
    return {
      message: {
        message: `Not authorized for: ${org} / ${site}.`,
        help: 'Are you logged into the correct profile?',
        status: resp.status,
      },
    };
  }
  const json = await resp.json();
  return { projects: json.reverse() };
}

async function fetchProject(project) {
  const resp = await daFetch(`${DA_ORIGIN}/source${project.path}`);
  if (!resp.ok) return { ...project, error: `Error fetching project: ${resp.status}` };
  return resp.json();
}

export async function fetchPagedDetails(projectList, pageCount) {
  // Filter down to the first 50 projects that don't have a title.
  const projectsToFetch = projectList.filter((item) => !item.title && !item.error)
    .slice(0, pageCount);

  return Promise.all(projectsToFetch.map(async (project) => {
    const timestamp = project.path.split('/').pop().replace('.json', '');
    const created = formatDate(Number(timestamp));
    const json = await fetchProject(project);
    const combined = {
      ...project,
      ...json,
      created,
      createdOn: Number(timestamp),
      langsTotal: json.langs?.length || 0,
    };

    if (json.modifiedDate) {
      combined.modified = formatDate(Number(json.modifiedDate));
    }

    if (json.langs) {
      const localesTotal = getLocalesTotal(json.langs);
      if (localesTotal) combined.localesTotal = localesTotal;

      const translateStatus = getTranslationStatus(json.langs);
      if (translateStatus) combined.translateStatus = translateStatus;
      const rolloutStatus = getRolloutStatus(json.langs);
      if (rolloutStatus) combined.rolloutStatus = rolloutStatus;
    }

    return combined;
  }));
}

export async function copyProject(project, email) {
  const { name, path } = project;

  const json = await fetchProject({ name, path });
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

  const opts = { body, method: 'POST' };

  const newName = Date.now();

  const newPath = path.replace(name, newName);

  await daFetch(`${DA_ORIGIN}/source${newPath}`, opts);

  return fetchPagedDetails([{ path: newPath, name: newName, ext: 'json', lastModified: newName }]);
}

export async function archiveProject(project) {
  const { path } = project;

  const formData = new FormData();
  formData.append('destination', path.replace('translation/active', 'translation/archive'));
  const opts = { body: formData, method: 'POST' };
  await daFetch(`${DA_ORIGIN}/move${project.path}`, opts);
}
