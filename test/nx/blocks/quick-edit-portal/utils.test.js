import { expect } from '@esm-bundle/chai';
import { setConfig } from '../../../../nx/scripts/nexter.js';
import { MESSAGE_TYPES } from '../../../../nx/utils/message-types.js';

setConfig({ imsClientId: 'test-client' });
document.head.append(Object.assign(document.createElement('script'), {
  type: 'text/plain',
  src: 'https://auth.services.adobe.com/imslib/imslib.min.js',
}));
window.adobeIMS = { getAccessToken: () => null };

const { handlePreview } = await import('../../../../nx/blocks/quick-edit-portal/src/utils.js');

describe('quick-edit portal preview', () => {
  let savedFetch;

  beforeEach(() => { savedFetch = window.fetch; });

  afterEach(() => { window.fetch = savedFetch; });

  it('reports the status code when the failed response has no status text', async () => {
    const posted = [];
    const ctx = {
      owner: 'org', repo: 'site', path: '/drafts/page', port: { postMessage: (message) => posted.push(message) },
    };
    window.fetch = async () => new Response('', { status: 404 });
    const preview = handlePreview(ctx);
    window.adobeid.onReady();
    await preview;

    expect(posted).to.deep.equal([
      { type: MESSAGE_TYPES.PREVIEW, payload: { ok: false, error: 'Failed to preview: 404' } },
    ]);
  });
});
