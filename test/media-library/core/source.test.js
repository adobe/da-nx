import { expect } from '@esm-bundle/chai';
import { DA_ADMIN, HLX_ADMIN } from '../../../nx/utils/utils.js';
import { setImsDetails } from '../../../nx/blocks/media-library/core/ims-adapter.js';
import { isHlx6, getSourceOrigin, saveSource } from '../../../nx/blocks/media-library/core/source.js';
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
    if (href.startsWith(`${HLX_ADMIN}/sidekick/`)) {
      return json({ contentSourceType: 'sourcebus', contentSourceUrl: `${AEM}/` });
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

    it('retries a ping that fails with 429 or 503', async () => {
      const org = uniqueOrg('hlx6');
      const ping = `${HLX_ADMIN}/ping/${org}/site`;
      const calls = stubFetch([[ping, pingAfterFailures([
        () => new Response('', { status: 429 }),
        () => new Response('', { status: 503 }),
      ])]]);

      expect(await isHlx6(org, 'site')).to.be.true;
      expect(calls.filter((c) => c.url === ping)).to.have.length(3);
    });

    it('does not retry a 429 whose x-retry-after is too long', async () => {
      const org = uniqueOrg('hlx6');
      const ping = `${HLX_ADMIN}/ping/${org}/site`;
      const calls = stubFetch([[ping, pingAfterFailures([
        () => new Response('', { status: 429, headers: { 'x-retry-after': '30' } }),
      ])]]);

      const error = await isHlx6(org, 'site').catch((e) => e);

      expect(error instanceof Error).to.equal(true);
      expect(calls.filter((c) => c.url === ping)).to.have.length(1);
    });

    it('rejects when the ping keeps failing, sends no source request and checks again next time', async () => {
      const org = uniqueOrg('hlx6');
      const unavailable = () => new Response('', { status: 503 });
      const calls = stubFetch([[`${HLX_ADMIN}/ping/${org}/site`, pingAfterFailures([
        unavailable, unavailable, unavailable,
      ])]]);

      const error = await saveSource({ path: `/${org}/site/.da/x.json`, json: '{}' }).catch((e) => e);

      expect(error instanceof Error).to.equal(true);
      expect(calls.filter((c) => !c.url.startsWith(`${HLX_ADMIN}/ping/`))).to.have.length(0);
      expect(await isHlx6(org, 'site')).to.be.true;
    });

    it('rejects on a 403 ping without remembering it', async () => {
      const org = uniqueOrg('legacy');
      const calls = stubFetch([[`${HLX_ADMIN}/ping/${org}/site`, pingAfterFailures([
        () => new Response('', { status: 403 }),
        () => new Response(''),
      ])]]);

      const error = await isHlx6(org, 'site').catch((e) => e);

      expect(error instanceof Error).to.equal(true);
      expect(await isHlx6(org, 'site')).to.be.false;
      expect(calls).to.have.length(2);
    });

    it('treats a 404 ping without the header as legacy DA', async () => {
      const org = uniqueOrg('legacy');
      stubFetch([[`${HLX_ADMIN}/ping/${org}/site`, () => new Response('', { status: 404 })]]);

      expect(await isHlx6(org, 'site')).to.be.false;
    });

    it('treats a site whose primary content is on DA as legacy, even with a source bus overlay', async () => {
      const org = uniqueOrg('hlx6');
      stubFetch([[`${HLX_ADMIN}/sidekick/${org}/site/main/config.json`, () => json({
        contentSourceType: 'markup',
        contentSourceUrl: `https://content.da.live/${org}/site/`,
      })]]);

      expect(await isHlx6(org, 'site')).to.be.false;
    });

    it('treats a sourcebus content source without a URL as Helix 6', async () => {
      const org = uniqueOrg('hlx6');
      stubFetch([[`${HLX_ADMIN}/sidekick/${org}/site/main/config.json`, () => json({ contentSourceType: 'sourcebus' })]]);

      expect(await isHlx6(org, 'site')).to.be.true;
    });

    it('rejects when the content source cannot be read', async () => {
      const org = uniqueOrg('hlx6');
      stubFetch([[`${HLX_ADMIN}/sidekick/${org}/site/main/config.json`, () => new Response('', { status: 500 })]]);

      const error = await isHlx6(org, 'site').catch((e) => e);

      expect(error instanceof Error).to.equal(true);
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

  describe('index lock writes', () => {
    it('sends a Helix 6 lock delete once, even when it fails', async () => {
      const org = uniqueOrg('hlx6');
      const lockUrl = `${AEM}/${org}/sites/site/source/.da/media-insights/index-lock.json`;
      const calls = stubFetch([[lockUrl, () => new Response('', { status: 503 })]]);

      const error = await removeIndexLock(`/${org}/site`).catch((e) => e);

      expect(error instanceof Error).to.equal(true);
      expect(calls.filter((c) => c.url === lockUrl)).to.have.length(1);
    });

    it('sends a Helix 6 lock write once, even after a network error', async () => {
      const org = uniqueOrg('hlx6');
      const lockUrl = `${AEM}/${org}/sites/site/source/.da/media-insights/index-lock.json`;
      const calls = stubFetch([[lockUrl, () => { throw new TypeError('Failed to fetch'); }]]);

      await createIndexLock(`/${org}/site`).catch(() => {});

      expect(calls.filter((c) => c.url === lockUrl)).to.have.length(1);
    });

    it('waits for a running heartbeat when it stops, and sends no more', async () => {
      const org = uniqueOrg('hlx6');
      const lockUrl = `${AEM}/${org}/sites/site/source/.da/media-insights/index-lock.json`;
      let release;
      const calls = stubFetch([[lockUrl, () => new Promise((resolve) => {
        release = () => resolve(new Response('', { status: 201 }));
      })]]);
      const { startIndexLockHeartbeat } = await import('../../../nx/blocks/media-library/indexing/locks.js');
      const stop = startIndexLockHeartbeat({ sitePath: `/${org}/site`, lockData: {}, intervalMs: 5 });
      while (!release) await new Promise((resolve) => { setTimeout(resolve, 5); });

      let stopped = false;
      const stopping = Promise.resolve(stop()).then(() => { stopped = true; });
      await new Promise((resolve) => { setTimeout(resolve, 20); });
      const stoppedBeforeRelease = stopped;
      release();
      await stopping;
      await new Promise((resolve) => { setTimeout(resolve, 20); });

      expect(stoppedBeforeRelease).to.equal(false);
      expect(calls.filter((c) => c.url === lockUrl)).to.have.length(1);
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

    it('reports a failed site check as an error, without listing', async () => {
      const org = uniqueOrg('hlx6');
      const calls = stubFetch([[`${HLX_ADMIN}/ping/${org}/site`, () => new Response('', { status: 500 })]]);

      const result = await validateSitePath(`/${org}/site`);

      expect(result.valid).to.be.false;
      expect(result.error).to.include('Try again');
      expect(calls.filter((c) => !c.url.startsWith(`${HLX_ADMIN}/ping/`))).to.have.length(0);
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
