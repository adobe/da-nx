import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../nx/utils/daFetch.js';
import { getUrls } from '../../nx/blocks/loc/views/translate/index.js';
import { MAX_CONCURRENT_READS } from '../../nx/blocks/loc/project/index.js';

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
});
