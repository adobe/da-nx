import { DA_ADMIN } from '../../../../nx2/utils/utils.js';
import { daFetch } from '../../../../nx2/utils/api.js';

// CodeMirror
import {
  EditorView,
  basicSetup,
  Compartment,
  json as cmjson,
  jsonParseLinter,
  linter,
  lintGutter,
  githubLight,
  oneDark,
} from '../../../deps/codemirror/dist/index.js';

const themeCompartment = new Compartment();

function getTheme() {
  const stored = localStorage.getItem('color-scheme');
  const isDark = stored ? stored === 'dark-scheme' : matchMedia('(prefers-color-scheme: dark)').matches;
  return isDark ? oneDark : githubLight;
}

const FORMS_BASE_PATH = '/.da/forms/schemas';
const HTML_SHELL = '<body><header></header><main><div><pre><code>{{JSON}}</code></pre></div></main><footer></footer></body>';

// loadSchema returns a tagged result the caller branches on via `status`:
//   { status: 'loaded', schema }      — parsed successfully
//   { status: 'invalid-json', raw }   — couldn't parse; raw text kept for repair
//   { status: 'load-failed' }         — couldn't fetch the source
// The status is an explicit contract, so the editor never has to inspect a
// schema's own fields (which could collide with a legitimate `invalid`/`error`
// property) to tell a real schema from a malformed one.
async function loadSchema(schema) {
  const resp = await daFetch({ url: `${DA_ADMIN}/source${schema.path}` });
  if (!resp.ok) return { status: 'load-failed' };
  const html = await resp.text();

  const parser = new DOMParser();
  const dom = parser.parseFromString(html, 'text/html');
  const jsonStr = dom.querySelector('code')?.textContent || '';

  try {
    return { status: 'loaded', schema: JSON.parse(jsonStr) };
  } catch {
    // Keep the raw text so a malformed schema opens for repair instead of
    // breaking the whole editor.
    return { status: 'invalid-json', raw: jsonStr };
  }
}

export async function loadSchemas(org, site) {
  const orgPath = `/${org}${FORMS_BASE_PATH}`;
  const sitePath = `/${org}/${site}${FORMS_BASE_PATH}`;
  const path = site ? sitePath : orgPath;

  let resp = await daFetch({ url: `${DA_ADMIN}/list${path}` });

  // If this was a site request, and it was empty, fallback to org
  if (!resp.ok && site) resp = await daFetch({ url: `${DA_ADMIN}/list${orgPath}` });

  if (!resp.ok) {
    // eslint-disable-next-line no-console
    console.log(`Cannot fetch schemas from ${path}.`);
    return {};
  }

  const json = await resp.json();
  if (!json) {
    // eslint-disable-next-line no-console
    console.log('Cannot read schemas.');
    return {};
  }

  // Map of schema name -> tagged result. Schemas that failed to fetch are
  // dropped so the editor only lists ones it can actually open.
  const entries = await Promise.all(
    json.map(async (schema) => [schema.name, await loadSchema(schema)]),
  );
  return Object.fromEntries(
    entries.filter(([, result]) => result.status !== 'load-failed'),
  );
}

export async function saveSchema(prefix, id, jsonStr) {
  const path = `${prefix}${FORMS_BASE_PATH}/${id}.html`;

  const content = HTML_SHELL.replace('{{JSON}}', jsonStr);

  const body = new FormData();
  const data = new Blob([content], { type: 'text/html' });
  body.append('data', data);

  const opts = { method: 'POST', body };
  const resp = await daFetch({ url: `${DA_ADMIN}/source${path}`, opts });
  if (!resp.ok) return { error: `Error saving. Status: ${resp.status}` };
  return { status: resp.status };
}

export async function deleteSchema(prefix, id) {
  const path = `${prefix}${FORMS_BASE_PATH}/${id}.html`;

  const opts = { method: 'DELETE' };
  const resp = await daFetch({ url: `${DA_ADMIN}/source${path}`, opts });
  if (!resp.ok) return { error: `Error deleting. Status: ${resp.status}` };
  return { status: resp.status };
}

export function loadCodeMirror(el, doc) {
  const editor = new EditorView({
    doc,
    extensions: [
      basicSetup,
      cmjson(),
      // Underline JSON syntax errors on the offending line, with a gutter marker.
      linter(jsonParseLinter()),
      lintGutter(),
      themeCompartment.of(getTheme()),
    ],
    parent: el,
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    editor.dispatch({ effects: themeCompartment.reconfigure(getTheme()) });
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
