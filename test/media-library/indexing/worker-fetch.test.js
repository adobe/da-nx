import { expect } from '@esm-bundle/chai';
import {
  saveIndexChunks,
  saveIndexMeta,
  loadMultiSheet,
  loadSheetMeta,
} from '../../../nx/blocks/media-library/indexing/worker/fetch.js';
import { AEM_API_ORIGIN } from '../../../nx/blocks/media-library/core/constants.js';

const DA = 'https://admin.da.live';
const BASE = '/org/site/.da/media-insights';

describe('worker source access', () => {
  let originalFetch;
  let calls;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    calls = [];
    globalThis.fetch = async (url, opts = {}) => {
      calls.push({ url: String(url), opts });
      if (String(url).endsWith('index-000.json')) {
        return new Response(JSON.stringify({ media: { data: [{ url: 'u' }] } }), { status: 200 });
      }
      if (String(url).endsWith('index-meta.json') && (opts.method || 'GET') === 'GET') {
        const meta = { data: [{ chunked: true, chunkCount: 1 }] };
        return new Response(JSON.stringify(meta), { status: 200 });
      }
      return new Response(null, { status: 201 });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('saves Helix 6 index chunks as raw JSON to the source bus', async () => {
    const count = await saveIndexChunks(BASE, [{ url: 'u' }], 100, AEM_API_ORIGIN, 'tok', 'index-');

    expect(count).to.equal(1);
    const [write] = calls;
    expect(write.url).to.equal('https://api.aem.live/org/sites/site/source/.da/media-insights/index-000.json');
    expect(write.opts.method).to.equal('POST');
    expect(write.opts.headers['Content-Type']).to.equal('application/json');
    expect(write.opts.headers.Authorization).to.equal('Bearer tok');
    expect(write.opts.headers['x-content-source-authorization']).to.be.undefined;
    expect(JSON.parse(write.opts.body).media.data).to.deep.equal([{ url: 'u' }]);
  });

  it('saves Helix 6 index meta as raw JSON to the source bus', async () => {
    await saveIndexMeta({ chunked: true, chunkCount: 1 }, `${BASE}/index-meta.json`, AEM_API_ORIGIN, 'tok');

    const [write] = calls;
    expect(write.url).to.equal('https://api.aem.live/org/sites/site/source/.da/media-insights/index-meta.json');
    expect(write.opts.method).to.equal('POST');
    expect(JSON.parse(write.opts.body).data).to.deep.equal([{ chunked: true, chunkCount: 1 }]);
  });

  it('reads Helix 6 index files from the source bus', async () => {
    const meta = await loadSheetMeta(`${BASE}/index-meta.json`, AEM_API_ORIGIN, 'tok');
    const media = await loadMultiSheet(`${BASE}/index-000.json`, 'media', AEM_API_ORIGIN, 'tok');

    expect(meta).to.deep.equal({ chunked: true, chunkCount: 1 });
    expect(media).to.deep.equal([{ url: 'u' }]);
    expect(calls.map((c) => c.url)).to.deep.equal([
      'https://api.aem.live/org/sites/site/source/.da/media-insights/index-meta.json',
      'https://api.aem.live/org/sites/site/source/.da/media-insights/index-000.json',
    ]);
  });

  it('keeps legacy DA chunk saves as multipart PUT to the DA source route', async () => {
    await saveIndexChunks(BASE, [{ url: 'u' }], 100, DA, 'tok', 'index-');

    const [write] = calls;
    expect(write.url).to.equal('https://admin.da.live/source/org/site/.da/media-insights/index-000.json');
    expect(write.opts.method).to.equal('PUT');
    expect(write.opts.body).to.be.instanceOf(FormData);
    expect(write.opts.headers['x-content-source-authorization']).to.be.undefined;
  });
});
