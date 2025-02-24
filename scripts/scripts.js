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
  imsScope: 'ab.manage,AdobeID,gnav,openid,org.read,read_organizations,session,additional_info.ownerOrg',
  decorateArea,
};

decorateArea();
setConfig(CONFIG);
loadArea();
