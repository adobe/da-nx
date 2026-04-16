import {
  deleteSkillFromConfig,
  loadSkillsFromConfig,
  upsertSkillInConfig,
} from '../../browse/skills-lab-api.js';

// CodeMirror
import {
  EditorView,
  basicSetup,
  githubLight,
} from '../../../deps/codemirror/dist/index.js';

function parseOrgSite(prefix) {
  const parts = String(prefix || '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);
  if (parts.length >= 2) return { org: parts[0], site: parts[1] };
  if (parts.length === 1) return { org: parts[0], site: '' };
  return { org: '', site: '' };
}

/** Skills: body in `/.da/skills/*.md` first; merged with config `skills` sheet (status, compat). */
export async function loadSkills(org, site) {
  if (!org) return {};
  return loadSkillsFromConfig(org, site || '');
}

/**
 * @param {string} prefix
 * @param {string} id
 * @param {string} content
 * @param {{ status?: 'draft'|'approved' }} [opts]
 */
export async function saveSkill(prefix, id, content, opts = {}) {
  const { org, site } = parseOrgSite(prefix);
  if (!org || !site) {
    return { error: 'Skills require org and site (save from a site-scoped context).' };
  }
  const result = await upsertSkillInConfig(org, site, id, content, opts);
  if (result.error) return { error: result.error };
  const out = { status: result.status ?? 200 };
  if (result.warning) out.warning = result.warning;
  if (result.configStatus != null) out.configStatus = result.configStatus;
  if (result.fileStatus != null) out.fileStatus = result.fileStatus;
  return out;
}

export async function deleteSkill(prefix, id) {
  const { org, site } = parseOrgSite(prefix);
  if (!org || !site) {
    return { error: 'Skills require org and site.' };
  }
  const result = await deleteSkillFromConfig(org, site, id);
  if (result.error) return { error: result.error };
  const out = { status: result.status ?? 200 };
  if (result.warning) out.warning = result.warning;
  if (result.configStatus != null) out.configStatus = result.configStatus;
  return out;
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
