import { createCopy } from './copy.js';

export { createCopy, createConfigLoader } from './copy.js';
export { regionalDiff, normalizeLinks, removeLocTags } from './regional-diff.js';
export {
  getDiffHash, HASH_LENGTH, ACCEPTED_KEY, REJECTED_KEY,
} from './hashes.js';

const copies = new WeakMap();

async function copy({
  fetch, daOrigin, urlSource, urlTarget, msg, sourceContent, normalizeImages,
  labelLocal, labelUpstream,
}, method) {
  if (!copies.has(fetch)) copies.set(fetch, new Map());
  const origins = copies.get(fetch);
  if (!origins.has(daOrigin)) {
    origins.set(daOrigin, createCopy({
      fetch,
      daOrigin,
    }));
  }
  const engine = origins.get(daOrigin);
  const result = await engine[method]({
    source: urlSource, destination: urlTarget, sourceContent, normalizeImages,
  }, msg, { labelLocal, labelUpstream });
  if (!(result instanceof Response)) return result.ok ? { ok: true, status: 200 } : result;
  if (result.ok) return { ok: true, status: result.status };
  return { ok: false, status: result.status, error: `Save failed (${result.status})` };
}

export const mergeCopy = (options) => copy(options, 'mergeCopy');
export const overwriteCopy = (options) => copy(options, 'overwriteCopy');
