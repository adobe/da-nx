import { loadBlock } from './nexter.js';

(async function loadPostLCP() {
  const header = document.querySelector('header');
  if (header) await loadBlock(header);
  import('../utils/fonts.js');
}());
