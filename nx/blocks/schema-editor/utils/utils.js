import { DA_ADMIN } from '../../../../nx2/utils/utils.js';
import { daFetch } from '../../../../nx2/utils/api.js';

// CodeMirror
import {
  EditorView,
  basicSetup,
  Compartment,
  json as cmjson,
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

async function loadSchema(schema) {
  const resp = await daFetch({ url: `${DA_ADMIN}/source${schema.path}` });
  if (!resp.ok) return { error: 'Could not load current schema.' };
  const html = await resp.text();

  const parser = new DOMParser();
  const dom = parser.parseFromString(html, 'text/html');
  const jsonStr = dom.querySelector('code').textContent;
  return JSON.parse(jsonStr);
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

  const schemas = await Promise.all(json.map(async (schema) => {
    const loaded = await loadSchema(schema);
    return { name: schema.name, ...loaded };
  }));

  const schemasObj = schemas.reduce((acc, schema) => {
    acc[schema.name] = schema;
    // Delete the actual name as it should not be in the JSON
    delete acc[schema.name].name;
    return acc;
  }, {});

  return schemasObj;
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
    extensions: [basicSetup, cmjson(), themeCompartment.of(getTheme())],
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
