import { source, asText } from '../../../../nx2/utils/api.js';
import { isValidEndpointName, parseConfig, serializeConfig } from './endpoint.js';

const SCHEMAS_PATH = '/.da/forms/schemas';
const ENDPOINTS_PATH = '/.da/graphql/endpoints';

const endpointPath = ({ org, site, name }) => `/${org}/${site}${ENDPOINTS_PATH}/${name}`;
const configPath = (args) => `${endpointPath(args)}/config.html`;
const artifactPath = (args) => `${endpointPath(args)}/schema.html`;

// DA codeblock document shell, as written by the schema editor.

const escapeHtml = (text) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

export const wrapCodeblock = (text) => `<body><header></header><main><div><pre><code>${
  escapeHtml(text)}</code></pre></div></main><footer></footer></body>`;

export const unwrapCodeblock = (html) => new DOMParser()
  .parseFromString(html ?? '', 'text/html').querySelector('code')?.textContent;

// Structured Content schema validation; the SDK is loaded lazily.

const STATUS_ISSUES = {
  'invalid-json': 'The schema document does not contain valid JSON.',
  'load-failed': 'The schema document could not be loaded.',
};

const loadValidator = () => import('../../../deps/da-sc-sdk/dist/index.js')
  .then(({ validateSchema }) => (schema) => validateSchema({ schema }));

export function describeIssues(issues = []) {
  const lines = issues.map((issue) => {
    const where = issue.schemaPath && issue.schemaPath !== '/' ? `#${issue.schemaPath}` : 'the schema root';
    const what = (issue.message || issue.reason || '').replace(/\.$/, '');
    return `${what} (at ${where})`;
  });
  return [...new Set(lines)];
}

// Adds `valid` and readable `issues` to each { id, status, schema? } entry.
export function annotateSchemas({ schemas = [], validate }) {
  return schemas.map((entry) => {
    if (entry.status !== 'loaded') {
      return { ...entry, valid: false, issues: [STATUS_ISSUES[entry.status] ?? 'Unknown error.'] };
    }
    if (!validate) return { ...entry, valid: true, issues: [] };
    const { valid, schemaIssues = [] } = validate(entry.schema);
    return { ...entry, valid, issues: valid ? [] : describeIssues(schemaIssues) };
  });
}

const failure = (status) => ({ error: 'Request failed.', status });

async function list({ path, continuationToken, items = [] }) {
  const result = await source.list(path, { continuationToken }).catch(() => ({}));
  if (!result.ok) return failure();
  const all = [...items, ...result.items];
  if (!result.continuationToken) return { items: all, permissions: result.permissions };
  return list({ path, continuationToken: result.continuationToken, items: all });
}

// A missing folder can list as an error (hlx6), so folder errors list as empty.
const listItems = async (path) => (await list({ path })).items ?? [];

async function read(path) {
  const { ok, data, status } = await asText(source.get(path)).catch(() => ({}));
  return ok ? { text: data } : failure(status);
}

async function send(request) {
  const resp = await request.catch(() => undefined);
  return resp?.ok ? { ok: true } : failure(resp?.status);
}

const listEndpoints = async ({ org, site }) => (await listItems(`/${org}/${site}${ENDPOINTS_PATH}`))
  .filter((item) => !item.ext && isValidEndpointName(item.name))
  .map((item) => item.name)
  .sort();

const listSchemaFiles = async ({ org, site }) => (await listItems(`/${org}/${site}${SCHEMAS_PATH}`))
  .filter((item) => item.ext === 'html');

// DA lists a missing site as empty, so any content means found; no `permissions` allows write.
export async function loadSite({ org, site }) {
  const [siteList, endpoints] = await Promise.all([
    list({ path: `/${org}/${site}` }),
    listEndpoints({ org, site }),
  ]);
  if (siteList.error) return { error: `Could not load ${org}/${site}.`, status: siteList.status };
  const found = siteList.items.length > 0 || endpoints.length > 0
    || (await listSchemaFiles({ org, site })).length > 0;
  const { permissions } = siteList;
  return { endpoints, found, canWrite: found && (!permissions || permissions.includes('write')) };
}

function parseSchemaDocument({ id, text }) {
  try {
    return { id, status: 'loaded', schema: JSON.parse(unwrapCodeblock(text) ?? '') };
  } catch {
    return { id, status: 'invalid-json' };
  }
}

async function readSchemas({ org, site }) {
  const [files, validate] = await Promise.all([
    listSchemaFiles({ org, site }),
    loadValidator().catch(() => undefined),
  ]);
  const schemas = await Promise.all(files.map(async ({ name: id, path }) => {
    const result = await read(path);
    return result.error ? { id, status: 'load-failed' } : parseSchemaDocument({ id, text: result.text });
  }));
  schemas.sort((a, b) => a.id.localeCompare(b.id));
  return annotateSchemas({ schemas, validate });
}

// Memoized per site, as every endpoint page of a site needs the same schemas.
export const loadSchemas = (() => {
  const bySite = new Map();
  return ({ org, site }) => {
    const key = `${org}/${site}`;
    if (!bySite.has(key)) {
      const loading = readSchemas({ org, site });
      loading.catch(() => bySite.delete(key));
      bySite.set(key, loading);
    }
    return bySite.get(key);
  };
})();

export async function loadEndpoint({ org, site, name }) {
  const result = await read(configPath({ org, site, name }));
  if (result.status === 404) return { error: `Endpoint "${name}" was not found.`, status: 404 };
  if (result.error) return { error: `Could not load endpoint "${name}".`, status: result.status };
  return parseConfig({ text: unwrapCodeblock(result.text) ?? '', name });
}

export async function saveEndpoint({
  org, site, config, artifact,
}) {
  const { name } = config;
  const configResult = await send(source.save(configPath({ org, site, name }), {
    body: wrapCodeblock(serializeConfig(config)),
  }));
  if (configResult.error) {
    return { error: 'Could not save the endpoint configuration.', status: configResult.status };
  }
  const artifactResult = await send(source.save(artifactPath({ org, site, name }), {
    body: wrapCodeblock(artifact),
  }));
  if (artifactResult.error) {
    return {
      error: 'The configuration was saved, but the GraphQL schema could not be saved.',
      status: artifactResult.status,
    };
  }
  return { ok: true };
}

export async function deleteEndpoint({ org, site, name }) {
  const results = await Promise.all([
    send(source.delete(artifactPath({ org, site, name }))),
    send(source.delete(configPath({ org, site, name }))),
  ]);
  const failed = results.find((result) => result.error && result.status !== 404);
  if (failed) return { error: `Could not delete endpoint "${name}".`, status: failed.status };
  // Best effort: drop the now empty endpoint folder.
  await send(source.delete(endpointPath({ org, site, name })));
  return { ok: true };
}
