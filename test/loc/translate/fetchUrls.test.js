import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../../nx/utils/daFetch.js';
import '../../../nx/blocks/loc/views/translate/translate.js';

const ORG = 'org';
const SITE = 'site';
const SOURCE_PATH = '/content/page.html';

function makeResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('NxLocTranslate.fetchUrls', () => {
  let originalFetch;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('fetches the config on every call, even when the config is cached', async () => {
    const config = { 'custom-doc-rules': { data: [] } };
    const source = '<main><p>content</p></main>';
    const fetchStub = sinon.stub(globalThis, 'fetch').callsFake((input) => {
      const url = String(typeof input === 'string' ? input : input.url);
      if (url.includes('/.da/translate.json')) return Promise.resolve(makeResponse(config));
      return Promise.resolve(new Response(source, { status: 200 }));
    });

    const element = document.createElement('nx-loc-translate');
    element.project = {
      org: ORG,
      site: SITE,
      snapshot: undefined,
      urls: [{ suppliedPath: SOURCE_PATH }],
      options: {
        'source.language': { location: '/' },
      },
    };
    element._options = element.project.options;
    element._urls = element.project.urls;

    const service = { connector: {} };
    await element.fetchUrls(service, true, []);
    await element.fetchUrls(service, true, []);

    const configRequests = fetchStub.getCalls().filter(({ args }) => {
      const url = String(typeof args[0] === 'string' ? args[0] : args[0].url);
      return url.includes('/.da/translate.json');
    });
    expect(configRequests).to.have.length(2);
  });
});
