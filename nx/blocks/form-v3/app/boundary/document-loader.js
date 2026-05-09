import { fetchSourceHtml } from './json-api.js';

export async function loadDocumentHtml(details) {
  if (!details?.sourceUrl) {
    return { error: 'Missing source URL.' };
  }

  return fetchSourceHtml({ sourceUrl: details.sourceUrl });
}
