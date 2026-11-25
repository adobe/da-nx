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

const { handlePreview } = await import('../../../../nx/blocks/quick-edit-portal/src/utils.js');

// Test pages share localStorage, and nx-ims makes the nx1 daFetch in other test files load IMS.
const keepNxIms = () => {
  const { setItem, removeItem } = Storage.prototype;
  Storage.prototype.setItem = function set(key, value) { if (key !== 'nx-ims') setItem.call(this, key, value); };
  Storage.prototype.removeItem = function remove(key) { if (key !== 'nx-ims') removeItem.call(this, key); };
  return () => Object.assign(Storage.prototype, { setItem, removeItem });
};

describe('quick-edit portal preview', () => {
  it('reports the status code when the failed response has no status text', async () => {
    const posted = [];
    const ctx = {
      owner: 'org', repo: 'site', path: '/drafts/page', port: { postMessage: (message) => posted.push(message) },
    };
    const savedFetch = window.fetch;
    window.fetch = async () => new Response('', { status: 404 });
    const restoreStorage = keepNxIms();
    try {
      const preview = handlePreview(ctx);
      window.adobeid?.onReady();
      await preview;
    } finally {
      window.fetch = savedFetch;
      restoreStorage();
    }

    const { type, payload } = posted.at(-1);
    expect(type).to.equal(MESSAGE_TYPES.PREVIEW);
    expect(payload.ok).to.equal(false);
    expect(payload.error).to.equal('Failed to preview: 404');
  });
});
