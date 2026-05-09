import { createFormV3App } from './app/bootstrap.js';

export { createFormV3App };

export default function init(el) {
  if (!el) return;
  el.dataset.formV3 = 'step-1-ready';
}
