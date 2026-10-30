import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { buildIncrementalIndex } from '../../../nx/blocks/media-library/indexing/worker/incremental.js';

const DA_ORIGIN = 'https://admin.da.example';
const FOLDER = `${DA_ORIGIN}/source/org/site/.da/media-insights`;
const context = { imsToken: 'token', daOrigin: DA_ORIGIN, daEtcOrigin: 'https://etc.da.example' };
const noop = () => {};

const json = (body) => new Response(JSON.stringify(body), { status: 200 });

describe('buildIncrementalIndex', () => {
  let fetchStub;

  function stubFetch({ index, auditlog }) {
    fetchStub = sinon.stub(globalThis, 'fetch').callsFake(async (url, opts = {}) => {
      const method = opts.method || 'GET';
      const { pathname } = new URL(url);
      if (method !== 'GET') return new Response('', { status: 201 });
      if (String(url) === `${FOLDER}/index-meta.json`) {
        return json({
          data: [{
            lastFetchTime: 1000, chunked: true, chunkCount: 1, schemaVersion: 2,
          }],
        });
      }
      if (String(url) === `${FOLDER}/index-000.json`) return json({ media: { data: index } });
      if (pathname.startsWith('/log/')) return json({ entries: auditlog });
      if (pathname.startsWith('/medialog/')) return json({ entries: [] });
      return new Response('', { status: 404 });
    });
  }

  afterEach(() => {
    sinon.restore();
  });

  it('applies a page unpreview when it is the only activity since the last build', async () => {
    stubFetch({
      index: [{
        hash: 'abc123',
        url: 'https://main--site--org.aem.page/media_abc123.png',
        doc: '/a.md',
        type: 'image',
        operation: 'reuse',
        timestamp: 900,
      }],
      auditlog: [{
        path: '/a', route: 'preview', method: 'DELETE', timestamp: 2000,
      }],
    });

    const index = await buildIncrementalIndex('/org/site', 'org', 'site', 'main', noop, noop, null, context);

    expect(index.filter((row) => row.doc === '/a.md')).to.have.lengthOf(0);
    expect(fetchStub.calledWith(`${FOLDER}/index-meta.json`, sinon.match({ method: 'POST' }))).to.equal(true);
  });

  it('applies a PDF unpreview when it is the only activity since the last build', async () => {
    stubFetch({
      index: [{
        hash: '/docs/a.pdf',
        url: 'https://main--site--org.aem.page/docs/a.pdf',
        doc: '',
        type: 'document',
        operation: 'auditlog-parsed',
        timestamp: 900,
      }],
      auditlog: [{
        path: '/docs/a.pdf', route: 'preview', method: 'DELETE', timestamp: 2000,
      }],
    });

    const index = await buildIncrementalIndex('/org/site', 'org', 'site', 'main', noop, noop, null, context);

    expect(index).to.have.lengthOf(0);
  });
});
