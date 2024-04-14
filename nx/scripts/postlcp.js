import { loadBlock } from './nexter.js';

(async function loadPostLCP() {
  import('../deps/rum.js').then((mod) => mod.default());
  const header = document.querySelector('header');
  if (header) await loadBlock(header);
  import('../utils/fonts.js');
}());
