import { source, asText } from '../../../../nx2/utils/api.js';

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

// Paths are `/{org}/{site}/...` strings. Org-level schemas (`/{org}/.da/...`)
// read as site `.da`, which is never upgraded to Helix 6, so they stay on
// admin.da.live.
const SCHEMAS_PATH = '/.da/forms/schemas';

const toSchemaHtml = (jsonStr) => `<body><header></header><main><div><pre><code>${jsonStr}</code></pre></div></main><footer></footer></body>`;

// loadSchema returns a tagged result the caller branches on via `status`:
//   { status: 'loaded', schema }      — parsed successfully
//   { status: 'invalid-json', raw }   — couldn't parse; raw text kept for repair
//   { status: 'load-failed' }         — couldn't fetch the source
// The status is an explicit contract, so the editor never has to inspect a
// schema's own fields (which could collide with a legitimate `invalid`/`error`
// property) to tell a real schema from a malformed one.
async function loadSchema(target) {
  const { ok, data: html } = await asText(source.get(target)).catch(() => ({}));
  if (!ok) return { status: 'load-failed' };

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

// Returns the listed entries, or undefined when the folder can't be listed.
async function listSchemas(prefix) {
  try {
    const { ok, items } = await source.list(`${prefix}${SCHEMAS_PATH}`);
    return ok ? items : undefined;
  } catch {
    return undefined;
  }
}

export async function loadSchemas(org, site) {
  const orgPrefix = `/${org}`;
  const sitePrefix = site ? `${orgPrefix}/${site}` : orgPrefix;

  let prefix = sitePrefix;
  let entries = await listSchemas(prefix);

  // If this was a site request, and it was empty, fallback to org
  if (!entries && site) {
    prefix = orgPrefix;
    entries = await listSchemas(prefix);
  }

  if (!entries) {
    // eslint-disable-next-line no-console
    console.log(`Cannot fetch schemas from ${sitePrefix}${SCHEMAS_PATH}.`);
    return {};
  }

  // Map of schema name -> tagged result. Schemas that failed to fetch are
  // dropped so the editor only lists ones it can actually open.
  const results = await Promise.all(entries.map(async (entry) => [
    entry.name,
    await loadSchema(entry.path),
  ]));
  return Object.fromEntries(
    results.filter(([, result]) => result.status !== 'load-failed'),
  );
}

export async function saveSchema(prefix, id, jsonStr) {
  const target = `${prefix}${SCHEMAS_PATH}/${id}.html`;
  try {
    const resp = await source.save(target, { body: toSchemaHtml(jsonStr) });
    if (!resp.ok) return { error: `Error saving. Status: ${resp.status}` };
    return { ok: true };
  } catch {
    return { error: 'Error saving. Status: network error' };
  }
}

export async function deleteSchema(prefix, id) {
  const target = `${prefix}${SCHEMAS_PATH}/${id}.html`;
  try {
    const resp = await source.delete(target);
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
