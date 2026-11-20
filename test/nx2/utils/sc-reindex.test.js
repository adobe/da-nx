import { expect } from '@esm-bundle/chai';
import { notifyScReindex, SC_REINDEX_URL_KEY } from '../../../nx2/utils/sc-reindex.js';
import { aem } from '../../../nx2/utils/api.js';

const SERVICE = 'https://reindex.example.com';

describe('notifyScReindex', () => {
  let calls;
  let orig;
  let n = 0;
  const uniq = () => {
    n += 1;
    return `x-${n}-${Date.now()}`;
  };

  // Config reads get the given editor.path rows and reindex URL; AEM preview/publish POSTs get
  // `aemStatus`; reindex service requests are recorded and run `service`.
  const mockFetch = ({
    editorPaths,
    reindexUrl = SERVICE,
    aemStatus = 200,
    service = () => new Response('', { status: 202 }),
  }) => {
    calls = [];
    orig = window.fetch;
    window.fetch = async (url, opts = {}) => {
      const u = url.toString();
      if (u.startsWith(SERVICE)) {
        calls.push({ url: u, ...opts });
        return service();
      }
      if (opts.method === 'POST') return new Response('{}', { status: aemStatus });
      const json = {
        ':type': 'multi-sheet',
        ':names': ['data'],
        data: {
          data: [
            ...editorPaths.map((value) => ({ key: 'editor.path', value })),
            ...(reindexUrl ? [{ key: SC_REINDEX_URL_KEY, value: reindexUrl }] : []),
          ],
        },
      };
      return new Response(JSON.stringify(json), { status: 200 });
    };
  };
  afterEach(() => { window.fetch = orig; });

  // Unique org and site per test: configs are cached by org/site.
  const setup = (opts = {}) => {
    const [org, site] = [uniq(), uniq()];
    mockFetch({ editorPaths: [`/${org}/${site}=/form#`], ...opts });
    return { org, site };
  };

  it('sends only structured content paths, as web paths, to the configured URL', async () => {
    const [org, site] = [uniq(), uniq()];
    mockFetch({
      editorPaths: [
        `/${org}/${site}/forms=https://da.live/form#`,
        `/${org}/${site}/forms/legacy=/edit#`,
        `/${org}/${site}/custom=https://da.live/app/aemsites/sc-editor/form#`,
      ],
      reindexUrl: `${SERVICE}/`,
    });
    await notifyScReindex({
      org,
      site,
      paths: ['/forms/a.html', '/forms/a', '/forms/legacy/b', '/custom/c', '/blog/d'],
    });
    expect(calls).to.have.length(1);
    expect(calls[0].url).to.equal(`${SERVICE}/${org}/${site}/reindex`);
    expect(calls[0].method).to.equal('POST');
    expect(calls[0].keepalive).to.equal(true);
    expect(JSON.parse(calls[0].body)).to.deep.equal({ tiers: ['live'], paths: ['/forms/a', '/custom/c'] });
  });

  it('sends nothing when no editor.path maps to the structured content editor', async () => {
    const { org, site } = setup({ editorPaths: [] });
    expect(await notifyScReindex({ org, site, paths: ['/a'] })).to.equal(0);
    expect(calls).to.have.length(0);
  });

  it('sends nothing unless a valid https reindex URL is configured', async () => {
    for (const reindexUrl of [null, 'not a url', 'http://reindex.example.com']) {
      const { org, site } = setup({ reindexUrl });
      expect(await notifyScReindex({ org, site, paths: ['/a'] })).to.equal(0);
      expect(calls).to.have.length(0);
      window.fetch = orig;
    }
  });

  it('splits more than 50 paths into several requests', async () => {
    const { org, site } = setup();
    const paths = Array.from({ length: 51 }, (_, i) => `/p${i}`);
    expect(await notifyScReindex({ org, site, paths })).to.equal(2);
    expect(JSON.parse(calls[1].body).paths).to.deep.equal(['/p50']);
  });

  it('never throws when the reindex service is unreachable', async () => {
    const { org, site } = setup({ service: () => { throw new TypeError('Failed to fetch'); } });
    expect(await notifyScReindex({ org, site, paths: ['/a'] })).to.equal(1);
  });

  describe('aem.publish hook', () => {
    const settle = () => new Promise((r) => { setTimeout(r, 50); });

    it('notifies on successful publish, never on preview', async () => {
      const { org, site } = setup();
      await aem.preview({ org, site, path: '/x.html' });
      await aem.publish({ org, site, path: ['/a', '/b'] });
      await settle();
      expect(calls.map((c) => [c.url, JSON.parse(c.body)])).to.deep.equal([
        [`${SERVICE}/${org}/${site}/reindex`, { tiers: ['live'], paths: ['/a', '/b'] }],
      ]);
    });

    it('returns the publish response unchanged when config and service both fail', async () => {
      const [org, site] = [uniq(), uniq()];
      const published = new Response('{}', { status: 200 });
      orig = window.fetch;
      window.fetch = async (url, opts = {}) => {
        if (url.toString().startsWith(SERVICE)) throw new TypeError('service down');
        if (url.toString().includes('/config/')) throw new TypeError('config down');
        if (opts.method === 'POST') return published;
        return new Response('{}', { status: 200 });
      };
      const resp = await aem.publish({ org, site, path: '/x.html' });
      await settle();
      expect(resp).to.equal(published);
    });

    it('does not notify when publish fails', async () => {
      const { org, site } = setup({ aemStatus: 403 });
      const resp = await aem.publish({ org, site, path: '/x.html' });
      await settle();
      expect(resp.status).to.equal(403);
      expect(calls).to.have.length(0);
    });
  });
});
