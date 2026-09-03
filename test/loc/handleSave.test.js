import { expect } from '@esm-bundle/chai';
import { setImsDetails } from '../../nx/utils/daFetch.js';
import '../../nx/blocks/loc/loc.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('NxLoc handleSave', () => {
  let savedBody;

  beforeEach(() => {
    setImsDetails('test-token');
    window.location.hash = '#/translate/org/site';
    savedBody = null;

    window.fetch = async (input, opts = {}) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/source/') && opts.method === 'POST') {
        const formData = await opts.body.formData?.() ?? opts.body;
        const data = formData.get('data');
        savedBody = JSON.parse(await data.text());
        return jsonResponse({});
      }
      return jsonResponse({});
    };
  });

  afterEach(() => {
    delete window.fetch;
  });

  it('merges urls by path when mergeUrls is set, and strips the flag before persisting', async () => {
    const el = document.createElement('nx-loc');
    el.path = '/project';
    el._project = {
      org: 'org',
      site: 'site',
      urls: [{ basePath: '/a.html', requestIds: { 'fr-FR': 'req-fr' } }],
    };

    await el.handleSave({
      detail: {
        data: {
          mergeUrls: true,
          urls: [{ basePath: '/a.html', requestIds: { 'de-DE': 'req-de' } }],
        },
      },
    });

    expect(savedBody.urls[0].requestIds).to.deep.equal({ 'fr-FR': 'req-fr', 'de-DE': 'req-de' });
    expect(savedBody.mergeUrls).to.equal(undefined);
  });

  it('replaces urls wholesale when mergeUrls is not set (validate/basics full-replace flows)', async () => {
    const el = document.createElement('nx-loc');
    el.path = '/project';
    el._project = {
      org: 'org',
      site: 'site',
      urls: [{ basePath: '/a.html', checked: true }, { basePath: '/b.html', checked: false }],
    };

    await el.handleSave({
      detail: { data: { urls: [{ basePath: '/a.html', checked: true }] } },
    });

    expect(savedBody.urls).to.deep.equal([{ basePath: '/a.html', checked: true }]);
  });

  it('serializes concurrent saves so a slower first save cannot overwrite a second save\'s merge', async () => {
    const el = document.createElement('nx-loc');
    el.path = '/project';
    el._project = {
      org: 'org',
      site: 'site',
      urls: [{ basePath: '/a.html', requestIds: {} }],
    };

    let callCount = 0;
    window.fetch = async (input, opts = {}) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/source/') && opts.method === 'POST') {
        callCount += 1;
        const isFirstCall = callCount === 1;
        const formData = await opts.body.formData?.() ?? opts.body;
        const data = formData.get('data');
        const body = JSON.parse(await data.text());
        // dispatchEvent doesn't wait for this async listener, so without
        // queuing, this slow first save would resolve (and overwrite
        // _project) after the fast second save already did.
        if (isFirstCall) await new Promise((resolve) => { setTimeout(resolve, 20); });
        savedBody = body;
        return jsonResponse({});
      }
      return jsonResponse({});
    };

    const first = el.handleSave({
      detail: { data: { mergeUrls: true, urls: [{ basePath: '/a.html', requestIds: { 'fr-CA': 'req-fr-ca' } }] } },
    });
    const second = el.handleSave({
      detail: { data: { mergeUrls: true, urls: [{ basePath: '/a.html', requestIds: { 'es-MX': 'req-es-mx' } }] } },
    });

    await Promise.all([first, second]);

    expect(savedBody.urls[0].requestIds).to.deep.equal({ 'fr-CA': 'req-fr-ca', 'es-MX': 'req-es-mx' });
  });
});
