import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../nx/scripts/nexter.js';
import { MESSAGE_TYPES } from '../../../../nx/utils/message-types.js';

setConfig({ imsClientId: 'test-client' });

const imsScript = document.createElement('script');
imsScript.type = 'text/plain';
imsScript.src = 'https://auth.services.adobe.com/imslib/imslib.min.js';
document.head.append(imsScript);
window.adobeIMS = {
  getAccessToken: () => ({ token: 'test-token' }),
  getProfile: async () => ({}),
};

const { default: decorate } = await import('../../../../nx/blocks/quick-edit-portal/quick-edit-portal.js');

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Test pages share localStorage, and nx-ims makes the nx1 daFetch in other test files load IMS.
const keepNxIms = () => {
  const { setItem, removeItem } = Storage.prototype;
  Storage.prototype.setItem = function set(key, value) { if (key !== 'nx-ims') setItem.call(this, key, value); };
  Storage.prototype.removeItem = function remove(key) { if (key !== 'nx-ims') removeItem.call(this, key); };
  return () => Object.assign(Storage.prototype, { setItem, removeItem });
};

describe('quick-edit portal', () => {
  it('opens the document again after a failed start, asking for the image cookie once', async () => {
    const owner = `qe-portal-${Math.floor(Math.random() * 1e6)}`;
    const calls = [];
    const savedFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const href = url.toString();
      calls.push({ href, method: opts.method || 'GET' });
      if (href.endsWith('/gimme_cookie')) return new Response('');
      throw new TypeError('Failed to fetch');
    };
    const restoreStorage = keepNxIms();

    try {
      const decorated = decorate(document.createElement('div'));
      window.adobeid.onReady();
      await decorated;

      const init = async () => {
        const { port2 } = new MessageChannel();
        const payload = {
          config: { mountpoint: `https://content.da.live/${owner}/site/` },
          location: { pathname: '/page' },
        };
        window.postMessage({ type: MESSAGE_TYPES.INIT, payload }, '*', [port2]);
        await wait(200);
      };
      await init();
      await init();
    } finally {
      window.fetch = savedFetch;
      restoreStorage();
    }

    const heads = calls.filter(({ href, method }) => method === 'HEAD' && href.includes(`/source/${owner}/`));
    const cookies = calls.filter(({ href }) => href.endsWith('/gimme_cookie'));
    expect(heads.length).to.equal(2);
    expect(cookies.length).to.equal(1);
  });
});
