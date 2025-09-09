import { loadBlock } from './nexter.js';
import { sampleRUM } from '../deps/rum.js';

(async function loadPostLCP() {
  window.hlx = window.hlx || {};
  window.hlx.RUM_MANUAL_ENHANCE = true;
  sampleRUM();
  const header = document.querySelector('header');
  if (header) await loadBlock(header);
  import('../utils/fonts.js');
}());
