import { setConfig, loadArea } from '../nx/scripts/nexter.js';

function decorateArea(area = document) {
  const eagerLoad = (parent, selector) => {
    const img = parent.querySelector(selector);
    img?.removeAttribute('loading');
  };

  (async function loadLCPImage() {
    const hero = area.querySelector('.nx-hero');
    if (!hero) {
      eagerLoad(area, 'img');
      return;
    }

    eagerLoad(hero, 'div:first-child img');
    eagerLoad(hero, 'div:last-child > div:last-child img');
  }());
}

const CONFIG = {
  codeBase: `${import.meta.url.replace('/scripts/scripts.js', '')}`,
  imsClientId: 'nexter',
  decorateArea,
};

import('https://rum.hlx.page/.rum/@adobe/helix-rum-js@^2/src/index.js').then((f) => f.sampleRUM());

decorateArea();
setConfig(CONFIG);
loadArea();
