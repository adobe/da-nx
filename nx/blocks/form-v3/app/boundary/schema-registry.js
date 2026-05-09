import { fetchSourceByPath, listPath } from './json-api.js';

const FORMS_BASE_PATH = '/.da/forms';
const schemaCache = new Map();

function cacheKey(owner, repo) {
  if (!owner || !repo) return '';
  return `${owner}/${repo}`;
}

async function loadSchemaDocument(entry) {
  const result = await fetchSourceByPath({ path: entry?.path });
  if (result.error || !result.html) return null;

  try {
    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    const jsonStr = doc.querySelector('code')?.textContent;
    if (!jsonStr) return null;
    return { id: entry.name, ...JSON.parse(jsonStr) };
  } catch {
    return null;
  }
}

export async function loadSchemas({ owner, repo, refresh = false } = {}) {
  const key = cacheKey(owner, repo);
  if (!key) return {};

  if (!refresh && schemaCache.has(key)) {
    return schemaCache.get(key);
  }

  const path = `/${owner}/${repo}${FORMS_BASE_PATH}/schemas`;
  const listed = await listPath({ path });
  if (listed.error) {
    schemaCache.set(key, {});
    return {};
  }

  const loaded = await Promise.all(
    listed.json.map((entry) => loadSchemaDocument(entry)),
  );

  const schemas = loaded.reduce((acc, schema) => {
    if (!schema?.id) return acc;
    acc[schema.id] = schema;
    return acc;
  }, {});

  schemaCache.set(key, schemas);
  return schemas;
}
