import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../nx/utils/daFetch.js';
import { getUrls } from '../../nx/blocks/loc/views/translate/index.js';
import { MAX_CONCURRENT_READS } from '../../nx/blocks/loc/project/index.js';
import { addDnt as applySheetDnt } from '../../nx/blocks/loc/dnt/dnt.js';

// getUrls must cap concurrent /source/ reads to MAX_CONCURRENT_READS to avoid
// flooding da-admin with OPTIONS+GET bursts during translation scan.

const ORG = 'org';
const SITE = 'site';

function makeUrls(count) {
  return Array.from({ length: count }, (_, i) => ({ suppliedPath: `/page-${i}.html` }));
}

function makeService() {
  return { connector: null };
}

function makeFetchStub({ delay = 5 } = {}) {
  return sinon.stub().callsFake((url) => {
    // Config fetch: respond immediately with empty config
    if (url.includes('/.da/translate')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ config: { data: [] } }),
      });
    }
    // Source content fetch: delay to make concurrency overlap observable
    return new Promise((resolve) => {
      setTimeout(() => resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => '<p>hello</p>',
      }), delay);
    });
  });
}

describe('getUrls', () => {
  let originalFetch;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
    window.location.hash = `#/${ORG}/${SITE}`;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('returns formatted URLs without contacting da-admin when fetchContent is false', async () => {
    globalThis.fetch = sinon.stub();
    const urls = makeUrls(3);
    const { urls: result } = await getUrls(ORG, SITE, makeService(), '/', '/', urls, false);

    expect(result).to.have.length(3);
    expect(globalThis.fetch.called).to.equal(false);
  });

  it('fetches content for every URL when fetchContent is true', async () => {
    globalThis.fetch = makeFetchStub();
    const urls = makeUrls(3);
    const { urls: result } = await getUrls(ORG, SITE, makeService(), '/', '/', urls, true);

    const sourceCalls = globalThis.fetch.args.filter(([url]) => url.includes('/source/') && !url.includes('/.da/'));
    expect(sourceCalls.length).to.equal(3);
    expect(result).to.have.length(3);
    result.forEach((url) => expect(url.content).to.equal('<p>hello</p>'));
  });

  it('never exceeds MAX_CONCURRENT_READS simultaneous /source/ reads', async () => {
    let active = 0;
    let peakActive = 0;

    globalThis.fetch = sinon.stub().callsFake((url) => {
      if (url.includes('/.da/translate')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ config: { data: [] } }),
        });
      }
      active += 1;
      peakActive = Math.max(peakActive, active);
      return new Promise((resolve) => {
        setTimeout(() => {
          active -= 1;
          resolve({
            ok: true,
            status: 200,
            headers: new Headers(),
            text: async () => '<p>content</p>',
          });
        }, 5);
      });
    });

    const urlCount = MAX_CONCURRENT_READS * 4;
    const { urls: result } = await getUrls(
      ORG,
      SITE,
      makeService(),
      '/',
      '/',
      makeUrls(urlCount),
      true,
    );

    expect(result).to.have.length(urlCount);
    expect(peakActive).to.be.at.most(
      MAX_CONCURRENT_READS,
      `Peak concurrent reads (${peakActive}) exceeded MAX_CONCURRENT_READS (${MAX_CONCURRENT_READS})`,
    );
  });

  it('marks a URL with an error when the /source/ fetch fails', async () => {
    globalThis.fetch = sinon.stub().callsFake((url) => {
      if (url.includes('/.da/translate')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ config: { data: [] } }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        headers: new Headers(),
        text: async () => '',
      });
    });

    const { urls: result } = await getUrls(ORG, SITE, makeService(), '/', '/', makeUrls(1), true);

    expect(result[0].error).to.include('404');
  });

  describe('DNT document path', () => {
    const run = async (suppliedPath, snapshot) => {
      globalThis.fetch = makeFetchStub({ delay: 0 });
      const addDnt = sinon.stub().resolves('<p>dnt</p>');
      const service = { connector: { dnt: { addDnt } } };
      const { urls } = await getUrls(
        ORG,
        SITE,
        service,
        '/en',
        '/fr',
        [{ suppliedPath }],
        true,
        snapshot,
      );
      return { addDnt, urls };
    };

    it('passes the language-agnostic path with extension to addDnt', async () => {
      const { addDnt, urls } = await run('/en/products/prices.json');

      expect(addDnt.calledOnce).to.be.true;
      expect(addDnt.firstCall.args[2]).to.deep.equal({
        fileType: 'json',
        path: '/products/prices.json',
      });
      expect(urls[0].content).to.equal('<p>dnt</p>');
    });

    it('passes a .html path for extensionless documents', async () => {
      const { addDnt } = await run('/en/products/page');

      expect(addDnt.firstCall.args[2]).to.deep.equal({
        fileType: undefined,
        path: '/products/page.html',
      });
    });

    it('excludes the snapshot prefix from DNT paths but keeps it in storage paths', async () => {
      const { addDnt: dntSpy, urls } = await run('/en/products/prices.json', 'draft');

      expect(dntSpy.firstCall.args[2]).to.deep.equal({
        fileType: 'json',
        path: '/products/prices.json',
      });
      expect(urls[0].daBasePath).to.equal('/.snapshots/draft/products/prices.json');
      expect(urls[0].daDestPath).to.equal('/.snapshots/draft/fr/products/prices.json');
      expect(globalThis.fetch.calledWithMatch('/source/org/site/.snapshots/draft/fr/products/prices.json'))
        .to.be.true;
      expect(urls[0].error).to.be.undefined;
    });

    it('normalizes extensionless snapshot documents for DNT', async () => {
      const { addDnt: dntSpy } = await run('/en/products/page', 'draft');

      expect(dntSpy.firstCall.args[2]).to.deep.equal({
        fileType: undefined,
        path: '/products/page.html',
      });
    });

    [undefined, 'draft'].forEach((snapshot) => {
      it(`protects path-scoped sheet columns ${snapshot ? 'in a snapshot' : 'without a snapshot'}`, async () => {
        const content = JSON.stringify({
          ':type': 'sheet',
          data: [{ sku: 'ABC123', title: 'Product' }],
        });
        const rules = { dnt: { data: [{ 'dnt-sheet': '/products/prices:data', 'dnt-columns': 'sku' }] } };
        globalThis.fetch = makeFetchStub({ delay: 0 });
        globalThis.fetch.withArgs(sinon.match('/products/')).resolves({
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () => content,
        });
        /**
         * Applies fixed rules independently of the cached site config.
         * @param {string} text Sheet source.
         * @param {Object} config Cached site config.
         * @param {Object} options Document type and path.
         * @returns {Promise<string>} Sheet HTML with DNT markup.
         */
        const applyDnt = (text, config, options) => applySheetDnt(text, rules, options);
        const { urls } = await getUrls(
          ORG,
          SITE,
          { connector: { dnt: { addDnt: applyDnt } } },
          '/en',
          '/fr',
          [
            { suppliedPath: '/en/products/prices.json' },
            { suppliedPath: '/en/products/other.json' },
          ],
          true,
          snapshot,
        );
        const [matching, other] = urls.map((url) => new DOMParser().parseFromString(url.content, 'text/html'));

        expect(urls.every((url) => !url.error)).to.be.true;
        expect(matching.querySelector('[key="sku"]').getAttribute('translate')).to.equal('no');
        expect(matching.querySelector('[key="title"]').getAttribute('translate')).to.be.null;
        expect(other.querySelector('[key="sku"]').getAttribute('translate')).to.be.null;
      });
    });

    it('does not call addDnt without a connector', async () => {
      globalThis.fetch = makeFetchStub({ delay: 0 });
      const { urls } = await getUrls(
        ORG,
        SITE,
        makeService(),
        '/en',
        '/fr',
        [{ suppliedPath: '/en/products/prices.json' }],
        true,
      );

      expect(urls[0].content).to.equal('<p>hello</p>');
    });
  });
});
