import json2html from './json2html.js';
import { pruneRecursive } from './prune.js';

/**
 * Serialise form JSON payload to DA HTML.
 * @param {Object} params
 * @param {Object} params.json - Form JSON payload ({ metadata, data })
 * @returns {string}
 */
export function serialise({ json } = {}) {
  const metadata = json?.metadata ?? {};
  const sourceData = json?.data ?? {};
  const data = pruneRecursive(sourceData) ?? {};
  return json2html({ metadata, data });
}
