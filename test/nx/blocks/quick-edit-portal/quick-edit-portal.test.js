import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../nx/scripts/nexter.js';
import { DA_ADMIN } from '../../../../nx2/utils/utils.js';
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

describe('quick-edit portal', () => {
  it('asks for the image cookie once when opening the document keeps failing', async () => {
    const owner = `qe-portal-${Math.floor(Math.random() * 1e6)}`;
    const calls = [];
    const savedFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const href = url.toString();
      calls.push({ href, method: opts.method || 'GET' });
      if (href.endsWith('/gimme_cookie') || href.includes('/ping/')) return new Response('');
      throw new TypeError('Failed to fetch');
    };

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
    }

    const heads = calls.filter(({ href, method }) => method === 'HEAD' && href.startsWith(DA_ADMIN));
    const cookies = calls.filter(({ href }) => href.endsWith('/gimme_cookie'));
    expect(heads.length).to.equal(2);
    expect(cookies.length).to.equal(1);
  });
});
