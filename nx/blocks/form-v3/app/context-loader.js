import {
  convertHtmlToJson,
  isEmptyDocumentHtml,
  isStructuredContentHtml,
} from './boundary/html2json.js';
import { loadDocumentHtml } from './boundary/document-loader.js';
import { getDisplayPath, isDocumentResource } from './boundary/document-resource.js';
import { loadSchemas } from './boundary/schema-registry.js';

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
