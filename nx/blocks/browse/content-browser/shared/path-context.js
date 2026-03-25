/**
 * Small path helpers shared by browse UI (no network, no DOM).
 * Same role as `blocks/browse/shared.js` in legacy da-live browse.
 */

/** @param {unknown} info */
export function pathInfoFullpath(info) {
  if (info == null || typeof info !== 'object') return null;
  const fp = /** @type {{ fullpath?: string }} */ (info).fullpath;
  return typeof fp === 'string' ? fp : null;
}

/**
 * Lit `hasChanged` for `{ pathSegments, fullpath }` blobs when the host passes a new object
 * each render (e.g. from `parseHashToPathContext` on every getter read).
 * @param {unknown} newVal
 * @param {unknown} oldVal
 */
export function pathInfoHasChanged(newVal, oldVal) {
  return pathInfoFullpath(newVal) !== pathInfoFullpath(oldVal);
}
