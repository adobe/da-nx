import {
  convertHtmlToJson,
  isEmptyDocumentHtml,
  isStructuredContentHtml,
} from './boundary/html2json.js';
import { fetchSourceHtml } from './boundary/da-source-api.js';
import { loadSchemas } from './boundary/schema-registry.js';

function isDocumentResource(details) {
  const fullpath = (details?.fullpath ?? '').trim();
  if (fullpath.toLowerCase().endsWith('.html')) return true;

  const sourceUrl = details?.sourceUrl;
  if (!sourceUrl || typeof sourceUrl !== 'string') return false;

  try {
    const { pathname } = new URL(sourceUrl);
    return pathname.toLowerCase().endsWith('.html');
  } catch {
    return false;
  }
}

function getDisplayPath(details) {
  const fullpath = (details?.fullpath ?? '').trim();
  return fullpath.toLowerCase().endsWith('.html')
    ? fullpath.slice(0, -5)
    : fullpath;
}

async function loadDocumentHtml(details) {
  if (!details?.sourceUrl) {
    return { error: 'Missing source URL.' };
  }

  return fetchSourceHtml({ sourceUrl: details.sourceUrl });
}

function mapLoadErrorToBlocker(result) {
  const status = result?.status;
  if (status === 401 || status === 403) return { type: 'no-access' };
  if (status === 404) return { type: 'not-document' };
  if (typeof status === 'number') return { type: 'load-failed', status };
  return { type: 'load-failed' };
}

function withBase(details, schemas) {
  return {
    details,
    schemas,
    displayPath: getDisplayPath(details),
  };
}

export async function loadFormContext({ details }) {
  const schemasPromise = loadSchemas({
    owner: details?.owner,
    repo: details?.repo,
  });

  if (!isDocumentResource(details)) {
    const schemas = await schemasPromise;
    return {
      status: 'blocked',
      blocker: { type: 'not-document' },
      ...withBase(details, schemas),
    };
  }

  const htmlPromise = loadDocumentHtml(details);
  const [schemas, documentResult] = await Promise.all([schemasPromise, htmlPromise]);

  if (documentResult.error) {
    return {
      status: 'blocked',
      blocker: mapLoadErrorToBlocker(documentResult),
      ...withBase(details, schemas),
    };
  }

  const html = documentResult?.html ?? '';
  if (isEmptyDocumentHtml(html)) {
    const hasSchemas = Object.keys(schemas).length > 0;
    return {
      status: hasSchemas ? 'select-schema' : 'no-schemas',
      ...withBase(details, schemas),
    };
  }

  if (!isStructuredContentHtml(html)) {
    return {
      status: 'blocked',
      blocker: { type: 'not-form-content' },
      ...withBase(details, schemas),
    };
  }

  const json = convertHtmlToJson(html);
  if (!json) {
    return {
      status: 'blocked',
      blocker: { type: 'load-failed' },
      ...withBase(details, schemas),
    };
  }

  const schemaName = json?.metadata?.schemaName;
  const schema = schemaName ? schemas?.[schemaName] : null;
  if (!schema) {
    return {
      status: 'blocked',
      blocker: {
        type: 'missing-schema',
        schemaName: schemaName ?? '',
      },
      json,
      ...withBase(details, schemas),
    };
  }

  return {
    status: 'ready',
    schemaName,
    schema,
    json,
    ...withBase(details, schemas),
  };
}
