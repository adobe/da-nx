import { createCopy, createConfigLoader } from '../../../utils/loc.js';

const copies = new WeakMap();

export async function mergeCopy({
  fetch, daOrigin, urlSource, urlTarget, msg,
}) {
  if (!copies.has(fetch)) copies.set(fetch, new Map());
  const origins = copies.get(fetch);
  if (!origins.has(daOrigin)) {
    origins.set(daOrigin, createCopy({
      fetch,
      loadConfig: createConfigLoader({ fetch, daOrigin }),
      daOrigin,
    }));
  }
  const result = await origins.get(daOrigin)
    .mergeCopy({ source: urlSource, destination: urlTarget }, msg);
  if (!(result instanceof Response)) return result.ok ? { ok: true, status: 200 } : result;
  if (result.ok) return { ok: true, status: result.status };
  return { ok: false, status: result.status, error: `Save failed (${result.status})` };
}
