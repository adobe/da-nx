import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { DA_ADMIN, HLX_ADMIN } from '../../../nx/utils/utils.js';
import { setImsDetails } from '../../../nx/blocks/media-library/core/ims-adapter.js';
import {
  isHlx6, getSourceOrigin, saveSource, listSource,
} from '../../../nx/blocks/media-library/core/source.js';
import { listFolder, checkIndex, loadSheet } from '../../../nx/blocks/media-library/indexing/admin-api.js';
import {
  checkIndexLock, createIndexLock, removeIndexLock,
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

const withRetryWaits = async (run) => {
  const clock = sinon.useFakeTimers({ toFake: ['setTimeout'] });
  try {
    const result = run();
    await clock.tickAsync(2000);
    return await result;
  } finally {
    clock.restore();
  }
};

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

    it('retries a ping that fails with 429 or 5xx after a fixed wait', async () => {
      const org = uniqueOrg('hlx6');
      const ping = `${HLX_ADMIN}/ping/${org}/site`;
      const calls = stubFetch([[ping, pingAfterFailures([
        () => new Response('', { status: 429, headers: { 'x-retry-after': '30' } }),
        () => new Response('', { status: 502 }),
      ])]]);

      expect(await withRetryWaits(() => isHlx6(org, 'site'))).to.be.true;
      expect(calls.filter((c) => c.url === ping)).to.have.length(3);
    });

    it('falls back to DA like main when the ping keeps failing, and keeps that answer', async () => {
      const org = uniqueOrg('hlx6');
      const ping = `${HLX_ADMIN}/ping/${org}/site`;
      const unavailable = () => new Response('', { status: 503 });
      const calls = stubFetch([[ping, pingAfterFailures([
        unavailable, unavailable, unavailable,
      ])]]);

      await withRetryWaits(() => saveSource({ path: `/${org}/site/.da/x.json`, json: '{}' }));

      expect(calls.filter((c) => c.url === ping)).to.have.length(3);
      expect(calls.filter((c) => !c.url.startsWith(`${HLX_ADMIN}/ping/`)).map((c) => c.url))
        .to.deep.equal([`${DA_ADMIN}/source/${org}/site/.da/x.json`]);
      expect(await isHlx6(org, 'site')).to.be.false;
      expect(calls.filter((c) => c.url === ping)).to.have.length(3);
    });

    it('falls back to DA after a network error on the ping', async () => {
      const org = uniqueOrg('hlx6');
      stubFetch([[`${HLX_ADMIN}/ping/${org}/site`, () => { throw new TypeError('Failed to fetch'); }]]);

      expect(await withRetryWaits(() => isHlx6(org, 'site'))).to.be.false;
    });

    it('treats a 403 ping as legacy DA without retrying', async () => {
      const org = uniqueOrg('hlx6');
      const calls = stubFetch([[`${HLX_ADMIN}/ping/${org}/site`, () => new Response('', { status: 403 })]]);

      expect(await isHlx6(org, 'site')).to.be.false;
      expect(calls).to.have.length(1);
    });

    it('treats a 404 ping without the header as legacy DA', async () => {
      const org = uniqueOrg('legacy');
      stubFetch([[`${HLX_ADMIN}/ping/${org}/site`, () => new Response('', { status: 404 })]]);

      expect(await isHlx6(org, 'site')).to.be.false;
    });

    it('treats a ping with the header as Helix 6, whatever the primary content source is', async () => {
      const org = uniqueOrg('hlx6');
      const calls = stubFetch([[`${HLX_ADMIN}/sidekick/${org}/site/main/config.json`, () => json({
        contentSourceType: 'onedrive',
        contentSourceUrl: `https://adobe.sharepoint.com/sites/${org}/Shared%20Documents/site`,
      })]]);

      expect(await isHlx6(org, 'site')).to.be.true;
      expect(calls.filter((c) => c.url.startsWith(`${HLX_ADMIN}/sidekick/`))).to.have.length(0);
    });

    it('classifies a site from the ping alone, without any other admin request', async () => {
      const org = uniqueOrg('hlx6');
      const calls = stubFetch([]);

      expect(await isHlx6(org, 'site')).to.be.true;
      expect(calls.map((c) => c.url)).to.deep.equal([`${HLX_ADMIN}/ping/${org}/site`]);
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

    it('reports a Helix 6 listing that is not an array as a failed listing', async () => {
      const org = uniqueOrg('hlx6');
      stubFetch([[`${AEM}/${org}/sites/site/source/.da/`, () => json({})]]);

      const listing = await listSource(`/${org}/site/.da`);

      expect(listing.ok).to.equal(false);
      expect(listing.status).to.equal(502);
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

    it('releases the Helix 6 lock without deleting the file', async () => {
      const org = uniqueOrg('hlx6');
      const lockUrl = `${AEM}/${org}/sites/site/source/.da/media-insights/index-lock.json`;
      let lockData = { locked: true, ownerId: 'me', timestamp: 1 };
      const calls = stubFetch([[lockUrl, (url, opts) => {
        if (opts.method === 'POST') {
          [lockData] = JSON.parse(opts.body).data;
          return new Response(null, { status: 201 });
        }
        return json({ data: [lockData] });
      }]]);

      const lock = await checkIndexLock(`/${org}/site`);
      await removeIndexLock(`/${org}/site`);
      const released = await checkIndexLock(`/${org}/site`);

      expect(lock.exists).to.be.true;
      expect(lock.ownerId).to.equal('me');
      expect(released.exists).to.be.true;
      expect(released.locked).to.be.false;
      const writes = calls.filter((c) => c.url === lockUrl && c.opts.method && c.opts.method !== 'GET');
      expect(writes).to.have.length(1);
      expect(writes[0].opts.method).to.equal('POST');
      expect(writes[0].opts.headers['Content-Type']).to.equal('application/json');
      expect(JSON.parse(writes[0].opts.body).data).to.deep.equal([{ locked: false }]);
    });

    it('still deletes the legacy DA lock', async () => {
      const org = uniqueOrg('legacy');
      const lockUrl = `${DA_ADMIN}/source/${org}/site/.da/media-insights/index-lock.json`;
      const calls = stubFetch([[lockUrl, () => new Response(null, { status: 204 })]]);

      await removeIndexLock(`/${org}/site`);

      const [write] = calls.filter((c) => c.url === lockUrl);
      expect(write.opts.method).to.equal('DELETE');
    });
  });

  describe('index lock writes', () => {
    it('sends a Helix 6 lock release once, even when it fails', async () => {
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

    it('accepts an empty Helix 6 site root', async () => {
      const org = uniqueOrg('hlx6');
      stubFetch([[`${AEM}/${org}/sites/site/source/`, () => json([])]]);

      const result = await validateSitePath(`/${org}/site`);

      expect(result).to.deep.equal({ valid: true, org, repo: 'site' });
    });

    it('still reports an empty legacy DA site root as not found', async () => {
      const org = uniqueOrg('legacy');
      stubFetch([[`${DA_ADMIN}/list/${org}/site/`, () => json([])]]);

      const result = await validateSitePath(`/${org}/site`);

      expect(result.valid).to.equal(false);
      expect(result.error).to.include('Site not found');
    });

    it('validates against the DA listing when the site check fails', async () => {
      const org = uniqueOrg('hlx6');
      const calls = stubFetch([
        [`${HLX_ADMIN}/ping/${org}/site`, () => new Response('', { status: 500 })],
        [`${DA_ADMIN}/list/${org}/site/`, () => json([{ name: 'index', ext: 'html', path: `/${org}/site/index.html` }])],
      ]);

      const result = await withRetryWaits(() => validateSitePath(`/${org}/site`));

      expect(result).to.deep.equal({ valid: true, org, repo: 'site' });
      expect(calls.filter((c) => !c.url.startsWith(`${HLX_ADMIN}/ping/`)).map((c) => c.url))
        .to.deep.equal([`${DA_ADMIN}/list/${org}/site/`]);
    });

    it('reports a Helix 6 site as not found when its check fails and DA has nothing', async () => {
      const org = uniqueOrg('hlx6');
      const calls = stubFetch([
        [`${HLX_ADMIN}/ping/${org}/site`, () => { throw new TypeError('Failed to fetch'); }],
        [`${DA_ADMIN}/list/${org}/site/`, () => json([])],
      ]);

      const result = await withRetryWaits(() => validateSitePath(`/${org}/site`));

      expect(result.valid).to.equal(false);
      expect(result.error).to.include('Site not found');
      expect(calls.filter((c) => c.url.startsWith(AEM))).to.have.length(0);
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
