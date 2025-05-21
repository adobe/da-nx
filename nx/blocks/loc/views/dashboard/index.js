import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { formatDate } from '../../utils/utils.js';

export async function fetchProjectList(org, site) {
  const resp = await daFetch(`${DA_ORIGIN}/list/${org}/${site}/.da/translation/active`);
  if (!resp.ok) return { message: { text: `Cannot fetch projects. Error: ${resp.status}` } };
  const json = await resp.json();
  return json.reverse();
}

export async function fetchPagedDetails(projectList, pageCount) {
  // Filter down to the first 50 projects that don't have a title.
  const projectsToFetch = projectList.filter((item) => !item.title && !item.error)
    .slice(0, pageCount);

  return Promise.all(projectsToFetch.map(async (project) => {
    const timestamp = project.path.split('/').pop().replace('.json', '');
    const created = formatDate(Number(timestamp));
    const resp = await daFetch(`${DA_ORIGIN}/source${project.path}`);
    if (!resp.ok) return { ...project, error: `Error fetching project: ${resp.status}` };
    const json = await resp.json();
    if (timestamp === '1747796031355') console.log(json);
    return {
      ...project,
      ...json,
      created,
      langsTotal: json.langs?.length,
    };
  }));
}
