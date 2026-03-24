import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { daFetch } from '../../../utils/daFetch.js';

// CodeMirror
import {
  EditorView,
  basicSetup,
  githubLight,
} from '../../../deps/codemirror/dist/index.js';

const SKILLS_BASE_PATH = '/.da/skills';

async function loadSkill(skill) {
  const resp = await daFetch(`${DA_ORIGIN}/source${skill.path}`);
  if (!resp.ok) return { error: 'Could not load skill.' };
  return resp.text();
}

export async function loadSkills(org, site) {
  const orgPath = `/${org}${SKILLS_BASE_PATH}`;
  const sitePath = `/${org}/${site}${SKILLS_BASE_PATH}`;
  const path = site ? sitePath : orgPath;

  let resp = await daFetch(`${DA_ORIGIN}/list${path}`);

  // If this was a site request and it was empty, fallback to org
  if (!resp.ok && site) resp = await daFetch(`${DA_ORIGIN}/list${orgPath}`);

  if (!resp.ok) {
    // eslint-disable-next-line no-console
    console.log(`Cannot fetch skills from ${path}.`);
    return {};
  }

  const json = await resp.json();
  if (!json) {
    // eslint-disable-next-line no-console
    console.log('Cannot read skills.');
    return {};
  }

  const mdFiles = json.filter((item) => item.ext === 'md');

  const skills = await Promise.all(mdFiles.map(async (skill) => {
    const content = await loadSkill(skill);
    return { name: skill.name, content };
  }));

  return skills.reduce((acc, skill) => {
    acc[skill.name] = skill.content;
    return acc;
  }, {});
}

export async function saveSkill(prefix, id, content) {
  const path = `${prefix}${SKILLS_BASE_PATH}/${id}.md`;

  const body = new FormData();
  const data = new Blob([content], { type: 'text/markdown' });
  body.append('data', data);

  const opts = { method: 'POST', body };
  const resp = await daFetch(`${DA_ORIGIN}/source${path}`, opts);
  if (!resp.ok) return { error: `Error saving. Status: ${resp.status}` };
  return { status: resp.status };
}

export async function deleteSkill(prefix, id) {
  const path = `${prefix}${SKILLS_BASE_PATH}/${id}.md`;

  const opts = { method: 'DELETE' };
  const resp = await daFetch(`${DA_ORIGIN}/source${path}`, opts);
  if (!resp.ok) return { error: `Error deleting. Status: ${resp.status}` };
  return { status: resp.status };
}

export function loadCodeMirror(el, doc) {
  const editor = new EditorView({
    doc,
    extensions: [basicSetup, githubLight],
    parent: el,
  });
  return editor;
}

export function updateCodeMirror(editor, doc) {
  editor.dispatch({
    changes: {
      from: 0,
      to: editor.state.doc.length,
      insert: doc,
    },
  });
}
