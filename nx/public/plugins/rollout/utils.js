import { createCopy, createConfigLoader } from '../../../utils/loc.js';

const copies = new WeakMap();

export function mergeCopy({
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
  return origins.get(daOrigin).mergeCopy({ source: urlSource, destination: urlTarget }, msg);
}
