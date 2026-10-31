import { expect } from '@esm-bundle/chai';
import { DA_ADMIN, HLX_ADMIN } from '../../../nx/utils/utils.js';
import { setImsDetails } from '../../../nx/blocks/media-library/core/ims-adapter.js';
import { isHlx6, getSourceOrigin } from '../../../nx/blocks/media-library/core/source.js';
import { listFolder, checkIndex, loadSheet } from '../../../nx/blocks/media-library/indexing/admin-api.js';
import {
  checkIndexLock,
  createIndexLock,
  removeIndexLock,
} from '../../../nx/blocks/media-library/indexing/locks.js';
import { loadMediaSheet } from '../../../nx/blocks/media-library/ui/data.js';
import { validateSitePath } from '../../../nx/blocks/media-library/core/paths.js';

const AEM = 'https://api.aem.live';

let counter = 0;
const uniqueOrg = (prefix) => {
  counter += 1;
  return `${prefix}${counter}${Date.now()}`;
};

const json = (body, init = {}) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'content-type': 'application/json' },
  ...init,
});

function stubFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    const href = String(url);
    const route = routes.find(([match]) => (typeof match === 'string' ? href === match : match.test(href)));
    if (route) return route[1](href, opts);
    if (href.startsWith(`${HLX_ADMIN}/ping/`)) {
      const hlx6 = href.includes('/hlx6');
      return new Response('', { headers: hlx6 ? { 'x-api-upgrade-available': 'true' } : {} });
    }
    return new Response('', { status: 404 });
  };
  return calls;
}

const helix6ListItem = (name, lastModified) => ({
  name,
  size: 10,
  'content-type': 'application/json',
  'last-modified': lastModified,
});

describe('media library source access', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('isHlx6', () => {
    it('detects Helix 6 sites from the admin ping header and memoizes per site', async () => {
      const calls = stubFetch([]);
      const org = uniqueOrg('hlx6');

      expect(await isHlx6(org, 'site')).to.be.true;
      expect(await isHlx6(org, 'site')).to.be.true;
      expect(calls.filter((c) => c.url === `${HLX_ADMIN}/ping/${org}/site`)).to.have.length(1);
    });

    it('treats sites without the header, or without a site, as legacy DA', async () => {
      stubFetch([]);
      expect(await isHlx6(uniqueOrg('legacy'), 'site')).to.be.false;
      expect(await isHlx6(uniqueOrg('hlx6'), undefined)).to.be.false;
    });

    const pingAfterFailures = (failures) => () => (failures.length
      ? failures.shift()()
      : new Response('', { headers: { 'x-api-upgrade-available': 'true' } }));

    it('retries a ping that fails with 429, 5xx or a network error', async () => {
      const org = uniqueOrg('hlx6');
      const calls = stubFetch([[`${HLX_ADMIN}/ping/${org}/site`, pingAfterFailures([
        () => new Response('', { status: 429 }),
        () => { throw new TypeError('Failed to fetch'); },
      ])]]);

      expect(await isHlx6(org, 'site')).to.be.true;
      expect(calls).to.have.length(3);
    });

    it('does not remember a ping that kept failing', async () => {
      const org = uniqueOrg('hlx6');
      const unavailable = () => new Response('', { status: 503 });
      const calls = stubFetch([[`${HLX_ADMIN}/ping/${org}/site`, pingAfterFailures([
        unavailable, unavailable, unavailable,
      ])]]);

      expect(await isHlx6(org, 'site')).to.be.false;
      expect(await isHlx6(org, 'site')).to.be.true;
      expect(calls).to.have.length(4);
    });

    it('resolves the source origin from a site path', async () => {
      stubFetch([]);
      expect(await getSourceOrigin(`/${uniqueOrg('hlx6')}/site/.da/x.json`)).to.equal(AEM);
      expect(await getSourceOrigin(`/${uniqueOrg('legacy')}/site/.da/x.json`)).to.equal(DA_ADMIN);
    });
  });

  describe('listFolder', () => {
    it('lists a Helix 6 folder from the source bus', async () => {
      const org = uniqueOrg('hlx6');
      const calls = stubFetch([[
        `${AEM}/${org}/sites/site/source/.da/media-insights/`,
        () => json([helix6ListItem('index-meta.json', '2026-10-09T10:00:00.000Z')]),
      ]]);

      const items = await listFolder(`/${org}/site/.da/media-insights`, org, 'site');

      expect(calls.some((c) => c.url.startsWith(`${DA_ADMIN}/list`))).to.be.false;
      expect(items).to.deep.equal([{
        name: 'index-meta',
        ext: 'json',
        path: `/${org}/site/.da/media-insights/index-meta.json`,
        lastModified: Date.parse('2026-10-09T10:00:00.000Z'),
      }]);
    });

    it('keeps listing legacy DA sites through the DA list API', async () => {
      const org = uniqueOrg('legacy');
      const daItems = [{ name: 'index-meta', ext: 'json', path: `/${org}/site/.da/media-insights/index-meta.json` }];
      stubFetch([[`${DA_ADMIN}/list/${org}/site/.da/media-insights`, () => json(daItems)]]);

      const items = await listFolder(`/${org}/site/.da/media-insights`, org, 'site');

      expect(items).to.deep.equal(daItems);
    });
  });

  describe('checkIndex', () => {
    it('finds a chunked Helix 6 index and its timestamp', async () => {
      const org = uniqueOrg('hlx6');
      const folder = `${AEM}/${org}/sites/site/source/.da/media-insights`;
      stubFetch([
        [`${folder}/index-meta.json`, () => json({ data: [{ chunked: true, chunkCount: 1 }] })],
        [`${folder}/`, () => json([
          helix6ListItem('index-000.json', '2026-10-09T10:00:00.000Z'),
          helix6ListItem('index-meta.json', '2026-10-09T10:00:05.000Z'),
        ])],
      ]);

      const result = await checkIndex(`/${org}/site/.da/media-insights`, org, 'site');

      expect(result).to.deep.equal({ exists: true, lastModified: Date.parse('2026-10-09T10:00:05.000Z') });
    });
  });

  describe('index lock', () => {
    it('writes the Helix 6 lock as raw JSON to the source bus', async () => {
      const org = uniqueOrg('hlx6');
      const lockUrl = `${AEM}/${org}/sites/site/source/.da/media-insights/index-lock.json`;
      const calls = stubFetch([[lockUrl, () => new Response('', { status: 201 })]]);

      await createIndexLock(`/${org}/site`);

      const write = calls.find((c) => c.url === lockUrl);
      expect(write.opts.method).to.equal('POST');
      expect(write.opts.headers['Content-Type']).to.equal('application/json');
      expect(JSON.parse(write.opts.body).data[0].locked).to.be.true;
    });

    it('keeps the legacy DA lock write unchanged', async () => {
      const org = uniqueOrg('legacy');
      const lockUrl = `${DA_ADMIN}/source/${org}/site/.da/media-insights/index-lock.json`;
      const calls = stubFetch([[lockUrl, () => new Response('', { status: 201 })]]);

      await createIndexLock(`/${org}/site`);

      const write = calls.find((c) => c.url === lockUrl);
      expect(write.opts.method).to.equal('PUT');
      expect(typeof write.opts.body).to.equal('string');
      expect(JSON.parse(write.opts.body).data[0].locked).to.be.true;
    });

    it('reads and removes the Helix 6 lock on the source bus', async () => {
      const org = uniqueOrg('hlx6');
      const lockUrl = `${AEM}/${org}/sites/site/source/.da/media-insights/index-lock.json`;
      const calls = stubFetch([[lockUrl, (url, opts) => (opts.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : json({ data: [{ locked: true, ownerId: 'me', timestamp: 1 }] }))]]);

      const lock = await checkIndexLock(`/${org}/site`);
      await removeIndexLock(`/${org}/site`);

      expect(lock.exists).to.be.true;
      expect(lock.ownerId).to.equal('me');
      expect(calls.find((c) => c.url === lockUrl && c.opts.method === 'DELETE')).to.exist;
    });
  });

  describe('loadMediaSheet', () => {
    it('loads a chunked Helix 6 index from the source bus', async () => {
      const org = uniqueOrg('hlx6');
      const folder = `${AEM}/${org}/sites/site/source/.da/media-insights`;
      const url = `https://main--site--${org}.aem.page/media_1.png`;
      stubFetch([
        [`${folder}/index-meta.json`, () => json({ data: [{ chunked: true, chunkCount: 1 }] })],
        [`${folder}/index-000.json`, () => json({ media: { data: [{ url, doc: '/index' }] } })],
      ]);

      const { data } = await loadMediaSheet(`/${org}/site`);

      expect(data).to.have.length(1);
      expect(data[0].doc).to.equal('/index');
      expect(new URL(data[0].url).pathname).to.equal('/media_1.png');
    });
  });

  describe('validateSitePath', () => {
    it('validates a Helix 6 site root from the source bus', async () => {
      const org = uniqueOrg('hlx6');
      stubFetch([[`${AEM}/${org}/sites/site/source/`, () => json([
        { name: 'index.html', 'content-type': 'text/html', 'last-modified': '2026-10-09T10:00:00.000Z' },
      ])]]);

      const result = await validateSitePath(`/${org}/site`);

      expect(result).to.deep.equal({ valid: true, org, repo: 'site' });
    });

    it('validates a Helix 6 folder against its parent listing', async () => {
      const org = uniqueOrg('hlx6');
      stubFetch([[`${AEM}/${org}/sites/site/source/`, () => json([
        { name: 'drafts/', 'content-type': 'application/folder' },
      ])]]);

      const result = await validateSitePath(`/${org}/site/drafts`);

      expect(result).to.deep.equal({ valid: true, org, repo: 'site' });
    });
  });

  describe('daFetch on the AEM API', () => {
    it('sends the IMS token as Authorization only and keeps 4 requests in flight', async () => {
      setImsDetails('test-token');
      const org = uniqueOrg('hlx6');
      let active = 0;
      let maxActive = 0;
      const calls = stubFetch([[new RegExp(`^${AEM}/${org}/sites/site/source/p\\d+\\.json$`), async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => { setTimeout(resolve, 20); });
        active -= 1;
        return json({ data: [] });
      }]]);

      await Promise.all(Array.from({ length: 6 }, (_, i) => loadSheet(`/${org}/site/p${i}.json`)));

      const sourceCalls = calls.filter((c) => c.url.startsWith(`${AEM}/`));
      expect(sourceCalls).to.have.length(6);
      expect(sourceCalls[0].opts.headers.Authorization).to.equal('Bearer test-token');
      expect(sourceCalls[0].opts.headers['x-content-source-authorization']).to.be.undefined;
      expect(maxActive).to.be.at.most(4);
    });
  });
});
