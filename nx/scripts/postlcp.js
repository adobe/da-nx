import { loadBlock } from './nexter.js';
import { sampleRUM } from '../deps/rum.js';

(async function loadPostLCP() {
  sampleRUM();
  const header = document.querySelector('header');
  if (header) await loadBlock(header);
  import('../utils/fonts.js');
}());
