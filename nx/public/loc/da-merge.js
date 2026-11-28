import DaMerge, { canonicalize } from '../../deps/da-merge/dist/index.js';

export * from '../../deps/da-merge/dist/index.js';

export const engine = new DaMerge({
  DOMParser, Node, document, canonicalize,
});
