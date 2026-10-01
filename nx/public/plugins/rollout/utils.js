import { createCopy, createConfigLoader } from '../../../utils/loc.js';

export function createMergeCopy({ fetch, daOrigin }) {
  return createCopy({
    fetch,
    loadConfig: createConfigLoader({ fetch, daOrigin }),
    daOrigin,
  }).mergeCopy;
}
