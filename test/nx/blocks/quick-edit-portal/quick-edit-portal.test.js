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

describe('quick-edit portal', () => {
  it('opens the document again after a failed start, asking for the image cookie once', async () => {
    const calls = [];
    const savedFetch = window.fetch;
    const { setItem } = Storage.prototype;
    const first = new MessageChannel();
    const second = new MessageChannel();
    const payload = {
      config: { mountpoint: 'https://content.da.live/org/site/' },
      location: { pathname: '/page' },
    };
    const init = (port) => window.postMessage({ type: MESSAGE_TYPES.INIT, payload }, '*', [port]);

    try {
      const decorated = decorate(document.createElement('div'));
      Storage.prototype.setItem = function set(key, value) {
        if (key !== 'nx-ims') setItem.call(this, key, value);
      };
      try {
        window.adobeid.onReady();
      } finally {
        Storage.prototype.setItem = setItem;
      }
      await decorated;

      const ready = new Promise((resolve) => {
        second.port1.onmessage = ({ data }) => resolve(data);
      });
      window.fetch = async (url) => {
        const { pathname } = new URL(url);
        calls.push(pathname);
        if (pathname === '/gimme_cookie') return new Response('');
        if (calls.length === 2) {
          init(second.port2);
          throw new TypeError('Failed to fetch');
        }
        return new Response(null, { status: 404 });
      };
      init(first.port2);

      expect(await ready).to.deep.equal({ type: MESSAGE_TYPES.READY });
      expect(calls).to.deep.equal(['/gimme_cookie', '/source/org/site/page.html', '/source/org/site/page.html']);
    } finally {
      window.fetch = savedFetch;
      first.port1.close();
      second.port1.close();
    }
  });
});
