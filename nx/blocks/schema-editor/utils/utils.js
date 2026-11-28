import { DA_ADMIN } from '../../../../nx2/utils/utils.js';
import {
  source, asText, daFetch, fromPath, isHlx6,
} from '../../../../nx2/utils/api.js';

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

const SCHEMAS_PATH = '/.da/forms/schemas';

// Names the source bus stores unchanged (it collapses and trims hyphens).
const STABLE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// admin.da.live: org-level schemas, legacy sites, and sites whose Helix 6 check fails.
const daSource = {
  list: async (path) => {
    const resp = await daFetch({ url: `${DA_ADMIN}/list${path}` });
    const items = resp.ok ? await resp.json() : [];
    return { ok: !!resp.ok && Array.isArray(items), items, status: resp.status };
  },
  get: (path) => daFetch({ url: `${DA_ADMIN}/source${path}` }),
  save: (path, { body }) => {
    const formData = new FormData();
    formData.append('data', new Blob([body], { type: 'text/html' }));
    return daFetch({ url: `${DA_ADMIN}/source${path}`, opts: { method: 'POST', body: formData } });
  },
  delete: (path) => daFetch({ url: `${DA_ADMIN}/source${path}`, opts: { method: 'DELETE' } }),
};

async function storeFor(org, site) {
  if (!site) return daSource;
  return (await isHlx6(org, site).catch(() => false)) ? source : daSource;
}

// The JSON goes into HTML, so `&` and `<` must stay text.
const escapeJson = (jsonStr) => jsonStr.replaceAll('&', '&amp;').replaceAll('<', '&lt;');

const toSchemaHtml = (jsonStr) => `<body><header></header><main><div><pre><code>${escapeJson(jsonStr)}</code></pre></div></main><footer></footer></body>`;

// loadSchema returns a tagged result the caller branches on via `status`:
//   { status: 'loaded', schema }      — parsed successfully
//   { status: 'invalid-json', raw }   — couldn't parse; raw text kept for repair
//   { status: 'load-failed' }         — couldn't fetch the source
// The status is an explicit contract, so the editor never has to inspect a
// schema's own fields (which could collide with a legitimate `invalid`/`error`
// property) to tell a real schema from a malformed one.
async function loadSchema(store, target) {
  const { ok, data: html, error } = await asText(store.get(target)).catch(() => ({}));
  if (!ok || error) return { status: 'load-failed' };

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

const listSchemas = (store, prefix) => store.list(`${prefix}${SCHEMAS_PATH}`);

// Throws when the site's schemas can't be loaded, so the editor never shows
// or writes schemas from another store than the site's.
export async function loadSchemas(org, site) {
  const orgPrefix = `/${org}`;
  const sitePrefix = site ? `${orgPrefix}/${site}` : orgPrefix;
  const store = await storeFor(org, site);

  let list = await listSchemas(store, sitePrefix);
  if (!list.ok && store === source) {
    // Helix 6 has no org-level store, and a site without schemas has no folder.
    if (list.status !== 404) throw new Error(`Cannot list schemas from ${sitePrefix}${SCHEMAS_PATH}.`);
    list = { ok: true, items: [] };
  }

  // If a legacy site listing failed, fall back to the org schemas
  if (!list.ok && site) list = await listSchemas(daSource, orgPrefix);

  if (!list.ok) {
    // eslint-disable-next-line no-console
    console.log(`Cannot fetch schemas from ${sitePrefix}${SCHEMAS_PATH}.`);
    return {};
  }

  // Map of schema name -> tagged result. Schemas that failed to fetch are
  // dropped so the editor only lists ones it can actually open.
  const results = await Promise.all(
    list.items.map(async (entry) => [entry.name, await loadSchema(store, entry.path)]),
  );
  return Object.fromEntries(
    results.filter(([, result]) => result.status !== 'load-failed'),
  );
}

// Helix 6 has no create-only save, so a create first checks that the name is free.
async function checkNewName(id, target) {
  if (!STABLE_NAME.test(id)) return 'Use lowercase letters and numbers, separated by single hyphens.';
  const { ok, status } = await source.getMetadata(target);
  if (ok) return 'A schema with this name already exists.';
  if (status === 404) return undefined;
  return `Error checking the schema name. Status: ${status ?? 'network error'}`;
}

export async function saveSchema(prefix, id, jsonStr, { create } = {}) {
  const target = `${prefix}${SCHEMAS_PATH}/${id}.html`;
  try {
    const { org, site } = fromPath(prefix);
    const store = await storeFor(org, site);
    const nameError = create && store === source && await checkNewName(id, target);
    if (nameError) return { error: nameError };
    const resp = await store.save(target, { body: toSchemaHtml(jsonStr) });
    if (!resp.ok) return { error: `Error saving. Status: ${resp.status}` };
    return { ok: true };
  } catch {
    return { error: 'Error saving. Status: network error' };
  }
}

export async function deleteSchema(prefix, id) {
  const target = `${prefix}${SCHEMAS_PATH}/${id}.html`;
  try {
    const { org, site } = fromPath(prefix);
    const store = await storeFor(org, site);
    const resp = await store.delete(target);
    if (!resp.ok) return { error: `Error deleting. Status: ${resp.status}` };
    return { ok: true };
  } catch {
    return { error: 'Error deleting. Status: network error' };
  }
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
