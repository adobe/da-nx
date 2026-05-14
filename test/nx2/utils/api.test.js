import { expect } from '@esm-bundle/chai';
import { setMockIms, resetMockIms } from '../../../nx2/test/mocks/ims.js';
import { HLX_ADMIN, AEM_API, DA_ADMIN } from '../../../nx2/utils/utils.js';
import {
  daFetch,
  isHlx6,
  signout,
  hlx6ToDaList,
  fromPath,
  source,
  versions,
  config,
  org,
  status,
  aem,
  snapshot,
  jobs,
} from '../../../nx2/utils/api.js';

const STORAGE_KEY = 'hlx6-upgrade';

let counter = 0;
const uniq = (label) => {
  counter += 1;
  return `${label}-${counter}-${Math.floor(Math.random() * 1e6)}`;
};

const makeOrgSite = ({ hlx6 = false } = {}) => {
  const o = uniq('org');
  const s = uniq('site');
  if (hlx6) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}),
      [`/${o}/${s}`]: true,
    }));
  }
  return { org: o, site: s };
};

let calls;
let origFetch;

const installFetch = ({ pingHlx6 = false, headers = {}, status: httpStatus = 200, body = '{}' } = {}) => {
  calls = [];
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    const u = url.toString();
    calls.push({ url: u, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
    if (u.includes(`${HLX_ADMIN}/ping/`)) {
      const respHeaders = pingHlx6 ? { 'x-api-upgrade-available': 'true' } : {};
      return new Response('', { status: 200, headers: respHeaders });
    }
    return new Response(body, { status: httpStatus, headers });
  };
};

const restoreFetch = () => {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
};

const lastCall = () => calls[calls.length - 1];
const callsTo = (origin) => calls.filter((c) => c.url.startsWith(origin));

describe('api.js', () => {
  beforeEach(() => {
    resetMockIms();
    localStorage.removeItem(STORAGE_KEY);
    installFetch();
  });

  afterEach(() => {
    restoreFetch();
  });

  describe('daFetch', () => {
    it('attaches Authorization for ALLOWED_TOKEN origins', async () => {
      await daFetch({ url: `${HLX_ADMIN}/ping/x/y` });
      expect(lastCall().headers.Authorization).to.equal('Bearer test-token');
    });

    it('also attaches x-content-source-authorization for HLX_ADMIN and AEM_API', async () => {
      await daFetch({ url: `${HLX_ADMIN}/ping/x/y` });
      expect(lastCall().headers['x-content-source-authorization']).to.equal('Bearer test-token');

      await daFetch({ url: `${AEM_API}/some/path` });
      expect(lastCall().headers['x-content-source-authorization']).to.equal('Bearer test-token');
    });

    it('does not attach auth for unknown origins', async () => {
      await daFetch({ url: 'https://example.com/foo' });
      expect(lastCall().headers.Authorization).to.be.undefined;
      expect(lastCall().headers['x-content-source-authorization']).to.be.undefined;
    });

    it('parses x-da-child-actions into permissions', async () => {
      restoreFetch();
      installFetch({ headers: { 'x-da-child-actions': 'role=read,write,delete' } });
      const resp = await daFetch({ url: `${AEM_API}/some/path` });
      expect(resp.permissions).to.deep.equal(['read', 'write', 'delete']);
    });

    it('falls back to x-da-actions when child actions missing', async () => {
      restoreFetch();
      installFetch({ headers: { 'x-da-actions': 'role=read,write' } });
      const resp = await daFetch({ url: `${AEM_API}/some/path` });
      expect(resp.permissions).to.deep.equal(['read', 'write']);
    });

    it('falls back to [read, write] when no permission headers', async () => {
      const resp = await daFetch({ url: `${AEM_API}/some/path` });
      expect(resp.permissions).to.deep.equal(['read', 'write']);
    });

    it('returns {} and signs in when no access token', async () => {
      setMockIms({ token: null });
      const resp = await daFetch({ url: `${HLX_ADMIN}/ping/a/b` });
      expect(resp).to.deep.equal({});
    });
  });

  describe('isHlx6', () => {
    it('returns false when site is missing', async () => {
      const result = await isHlx6('myorg', null);
      expect(result).to.equal(false);
    });

    it('returns true when ping responds with x-api-upgrade-available', async () => {
      restoreFetch();
      installFetch({ pingHlx6: true });
      const o = uniq('org');
      const s = uniq('site');
      const result = await isHlx6(o, s);
      expect(result).to.equal(true);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      expect(stored[`/${o}/${s}`]).to.equal(true);
    });

    it('uses localStorage cache without fetching', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      const result = await isHlx6(o, s);
      expect(result).to.equal(true);
      // No ping call made (in-memory call may or may not occur but no /ping/ url)
      const pingCalls = calls.filter((c) => c.url.includes(`${HLX_ADMIN}/ping/`));
      expect(pingCalls).to.have.lengthOf(0);
    });
  });

  describe('source', () => {
    it('source.get hits DA on legacy', async () => {
      const { org: o, site: s } = makeOrgSite();
      // Trigger a ping fetch by querying — it returns no upgrade header → legacy
      await source.get({ org: o, site: s, path: '/index.html' });
      const last = lastCall();
      expect(last.url).to.equal(`${DA_ADMIN}/source/${o}/${s}/index.html`);
      expect(last.method).to.equal('GET');
    });

    it('source.get hits AEM_API on hlx6', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await source.get({ org: o, site: s, path: '/index.html' });
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites/${s}/source/index.html`);
    });

    it('source.list uses /list on legacy', async () => {
      const { org: o, site: s } = makeOrgSite();
      await source.list({ org: o, site: s, path: '/folder' });
      expect(lastCall().url).to.equal(`${DA_ADMIN}/list/${o}/${s}/folder`);
    });

    it('source.list uses source URL with trailing slash on hlx6', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await source.list({ org: o, site: s, path: '/folder' });
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites/${s}/source/folder/`);
    });

    it('source.list root path hlx6 uses /', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await source.list({ org: o, site: s });
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites/${s}/source/`);
    });

    it('source.list org-only hits DA legacy /list/{org}', async () => {
      const o = uniq('org');
      await source.list({ org: o });
      expect(lastCall().url).to.equal(`${DA_ADMIN}/list/${o}`);
    });

    it('source.put DA wraps body in FormData', async () => {
      const { org: o, site: s } = makeOrgSite();
      const body = new Blob(['<html></html>'], { type: 'text/html' });
      await source.put({ org: o, site: s, path: '/page.html', body });
      const last = lastCall();
      expect(last.method).to.equal('PUT');
      expect(last.body).to.be.instanceof(FormData);
      const stored = last.body.get('data');
      expect(stored).to.be.instanceof(Blob);
      expect(stored.size).to.equal(body.size);
    });

    it('source.put hlx6 sets Content-Type for known text exts', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await source.put({ org: o, site: s, path: '/page.html', body: '<main></main>' });
      const last = lastCall();
      expect(last.method).to.equal('PUT');
      expect(last.headers['Content-Type']).to.equal('text/html');
      expect(last.body).to.equal('<main></main>');
    });

    it('source.put hlx6 passes body as-is for non-text exts', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      const blob = new Blob(['binary'], { type: 'image/png' });
      await source.put({ org: o, site: s, path: '/img.png', body: blob });
      const last = lastCall();
      expect(last.headers['Content-Type']).to.be.undefined;
      expect(last.body).to.equal(blob);
    });

    it('source.getMetadata sends HEAD', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await source.getMetadata({ org: o, site: s, path: '/x.html' });
      expect(lastCall().method).to.equal('HEAD');
    });

    it('source.delete sends DELETE', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await source.delete({ org: o, site: s, path: '/x.html' });
      expect(lastCall().method).to.equal('DELETE');
    });

    it('source.copy hlx6 PUTs with source/collision query params', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await source.copy({ org: o, site: s, path: '/src.html', destination: '/dest.html', collision: 'overwrite' });
      const last = lastCall();
      expect(last.method).to.equal('PUT');
      const u = new URL(last.url);
      expect(u.pathname).to.equal(`/${o}/sites/${s}/source/dest.html`);
      expect(u.searchParams.get('source')).to.equal('/src.html');
      expect(u.searchParams.get('collision')).to.equal('overwrite');
      expect(u.searchParams.get('move')).to.be.null;
    });

    it('source.copy legacy POSTs to /copy/{org}/{site}{path} with destination form field', async () => {
      const { org: o, site: s } = makeOrgSite();
      await source.copy({ org: o, site: s, path: '/src.html', destination: '/dest.html' });
      const last = lastCall();
      expect(last.url).to.equal(`${DA_ADMIN}/copy/${o}/${s}/src.html`);
      expect(last.method).to.equal('POST');
      expect(last.body).to.be.instanceof(FormData);
      expect(last.body.get('destination')).to.equal('/dest.html');
    });

    it('source.move hlx6 adds move=true', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await source.move({ org: o, site: s, path: '/src.html', destination: '/dest.html' });
      const u = new URL(lastCall().url);
      expect(u.pathname).to.equal(`/${o}/sites/${s}/source/dest.html`);
      expect(u.searchParams.get('move')).to.equal('true');
      expect(u.searchParams.get('source')).to.equal('/src.html');
    });

    it('source.move legacy POSTs to /move/{org}/{site}{path} with destination form field', async () => {
      const { org: o, site: s } = makeOrgSite();
      await source.move({ org: o, site: s, path: '/src.html', destination: '/dest.html' });
      const last = lastCall();
      expect(last.url).to.equal(`${DA_ADMIN}/move/${o}/${s}/src.html`);
      expect(last.method).to.equal('POST');
      expect(last.body.get('destination')).to.equal('/dest.html');
    });

    it('source.get accepts a full /org/site/path string', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await source.get(`/${o}/${s}/index.html`);
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites/${s}/source/index.html`);
    });

    it('source.put accepts a path string with extras', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await source.put(`/${o}/${s}/page.html`, { body: '<main></main>' });
      const last = lastCall();
      expect(last.url).to.equal(`${AEM_API}/${o}/sites/${s}/source/page.html`);
      expect(last.body).to.equal('<main></main>');
    });

    it('source.copy accepts a path string with extras', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await source.copy(`/${o}/${s}/src.html`, {
        destination: '/dest.html',
        collision: 'overwrite',
      });
      const u = new URL(lastCall().url);
      expect(u.pathname).to.equal(`/${o}/sites/${s}/source/dest.html`);
      expect(u.searchParams.get('source')).to.equal('/src.html');
      expect(u.searchParams.get('collision')).to.equal('overwrite');
    });

    it('source.get logs an error when org is missing', async () => {
      const origErr = console.error;
      let errored = false;
      console.error = () => { errored = true; };
      try {
        await source.get('');
      } finally {
        console.error = origErr;
      }
      expect(errored).to.equal(true);
    });

    it('source.createFolder POSTs with trailing slash', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await source.createFolder({ org: o, site: s, path: '/folder' });
      const last = lastCall();
      expect(last.url).to.equal(`${AEM_API}/${o}/sites/${s}/source/folder/`);
      expect(last.method).to.equal('POST');
    });

    it('source.deleteFolder DELETEs with trailing slash', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await source.deleteFolder({ org: o, site: s, path: '/folder' });
      const last = lastCall();
      expect(last.url).to.equal(`${AEM_API}/${o}/sites/${s}/source/folder/`);
      expect(last.method).to.equal('DELETE');
    });
  });

  describe('versions', () => {
    it('versions.list legacy hits /versionlist', async () => {
      const { org: o, site: s } = makeOrgSite();
      await versions.list({ org: o, site: s, path: '/x.html' });
      expect(lastCall().url).to.equal(`${DA_ADMIN}/versionlist/${o}/${s}/x.html`);
    });

    it('versions.list hlx6 hits .versions sub-resource', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await versions.list({ org: o, site: s, path: '/x.html' });
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites/${s}/source/x.html/.versions`);
    });

    it('versions.list accepts a path string', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await versions.list(`/${o}/${s}/x.html`);
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites/${s}/source/x.html/.versions`);
    });

    it('versions.get accepts a path string with versionId in extras', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await versions.get(`/${o}/${s}/x.html`, { versionId: 'abc' });
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites/${s}/source/x.html/.versions/abc`);
    });

    it('versions.get hlx6 hits source/.versions/{id}', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await versions.get({ org: o, site: s, path: '/x.html', versionId: 'abc' });
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites/${s}/source/x.html/.versions/abc`);
    });

    it('versions.get legacy hits /versionsource/{org}/{versionId}', async () => {
      const { org: o, site: s } = makeOrgSite();
      await versions.get({ org: o, site: s, path: '/x.html', versionId: 'guid1/guid2.html' });
      expect(lastCall().url).to.equal(`${DA_ADMIN}/versionsource/${o}/guid1/guid2.html`);
    });

    it('versions.create hlx6 POSTs operation/comment as JSON body', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await versions.create({ org: o, site: s, path: '/x.html', operation: 'preview', comment: 'note' });
      const last = lastCall();
      expect(last.method).to.equal('POST');
      expect(last.headers['Content-Type']).to.equal('application/json');
      expect(JSON.parse(last.body)).to.deep.equal({ operation: 'preview', comment: 'note' });
    });

    it('versions.create legacy POSTs comment as { label } JSON body', async () => {
      const { org: o, site: s } = makeOrgSite();
      await versions.create({ org: o, site: s, path: '/x.html', comment: 'My Label' });
      const last = lastCall();
      expect(last.method).to.equal('POST');
      expect(last.body).to.equal('{"label":"My Label"}');
    });

    it('versions.create with no comment sends no body', async () => {
      const { org: o, site: s } = makeOrgSite();
      await versions.create({ org: o, site: s, path: '/x.html' });
      const last = lastCall();
      expect(last.method).to.equal('POST');
      expect(last.body).to.be.undefined;
    });
  });

  describe('config', () => {
    it('config.get site-level hlx6', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await config.get({ org: o, site: s });
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites/${s}/config.json`);
    });

    it('config.get org-only legacy', async () => {
      const o = uniq('org');
      await config.get({ org: o });
      expect(lastCall().url).to.equal(`${DA_ADMIN}/config/${o}/`);
    });

    it('config.put uses FormData with config field', async () => {
      const { org: o, site: s } = makeOrgSite();
      await config.put({ org: o, site: s, body: '{"foo":"bar"}' });
      const last = lastCall();
      expect(last.method).to.equal('POST');
      expect(last.body).to.be.instanceof(FormData);
      expect(last.body.get('config')).to.equal('{"foo":"bar"}');
    });

    it('config.delete sends DELETE', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await config.delete({ org: o, site: s });
      expect(lastCall().method).to.equal('DELETE');
    });

    it('config.getAggregated is hlx6-only', async () => {
      const legacy = makeOrgSite();
      const r = await config.getAggregated({ org: legacy.org, site: legacy.site });
      expect(r.status).to.equal(501);

      const up = makeOrgSite({ hlx6: true });
      await config.getAggregated({ org: up.org, site: up.site });
      expect(lastCall().url).to.equal(`${AEM_API}/${up.org}/aggregated/${up.site}/config.json`);
    });
  });

  describe('org', () => {
    it('org.listSites hits AEM_API', async () => {
      const o = uniq('org');
      await org.listSites({ org: o });
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites`);
    });
  });

  describe('status', () => {
    it('GETs single path on hlx6', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await status.get({ org: o, site: s, path: '/page.html' });
      const last = lastCall();
      expect(last.url).to.equal(`${AEM_API}/${o}/sites/${s}/status/page.html`);
      expect(last.method).to.equal('GET');
    });

    it('accepts a full /org/site/path string', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await status.get(`/${o}/${s}/page.html`);
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites/${s}/status/page.html`);
    });

    it('legacy uses HLX_ADMIN with main ref', async () => {
      const { org: o, site: s } = makeOrgSite();
      await status.get({ org: o, site: s, path: '/page.html' });
      expect(lastCall().url).to.equal(`${HLX_ADMIN}/status/${o}/${s}/main/page.html`);
    });
  });

  describe('aem (preview/live combined)', () => {
    it('aem.preview single POSTs', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await aem.preview({ org: o, site: s, path: '/x.html' });
      const last = lastCall();
      expect(last.url).to.equal(`${AEM_API}/${o}/sites/${s}/preview/x.html`);
      expect(last.method).to.equal('POST');
    });

    it('aem.preview accepts a path string', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await aem.preview(`/${o}/${s}/x.html`);
      const last = lastCall();
      expect(last.url).to.equal(`${AEM_API}/${o}/sites/${s}/preview/x.html`);
      expect(last.method).to.equal('POST');
    });

    it('aem.preview bulk uses /* and { paths }', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await aem.preview({ org: o, site: s, path: ['/a', '/b'] });
      const last = lastCall();
      expect(last.url).to.equal(`${AEM_API}/${o}/sites/${s}/preview/*`);
      expect(JSON.parse(last.body)).to.deep.equal({ paths: ['/a', '/b'] });
    });

    it('aem.unPreview single DELETEs', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await aem.unPreview({ org: o, site: s, path: '/x.html' });
      expect(lastCall().method).to.equal('DELETE');
    });

    it('aem.unPreview bulk includes delete:true', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await aem.unPreview({ org: o, site: s, path: ['/a', '/b'] });
      const last = lastCall();
      expect(last.method).to.equal('POST');
      expect(JSON.parse(last.body)).to.deep.equal({ paths: ['/a', '/b'], delete: true });
    });

    it('aem.publish hits /live', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await aem.publish({ org: o, site: s, path: '/x.html' });
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites/${s}/live/x.html`);
    });

    it('aem.unPublish bulk includes delete:true', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await aem.unPublish({ org: o, site: s, path: ['/a', '/b'] });
      const last = lastCall();
      expect(last.url).to.equal(`${AEM_API}/${o}/sites/${s}/live/*`);
      expect(JSON.parse(last.body)).to.deep.equal({ paths: ['/a', '/b'], delete: true });
    });

    it('aem.preview single ignores forceUpdate/forceSync (bulk-only flags)', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await aem.preview({
        org: o, site: s, path: '/x.html', forceUpdate: true, forceSync: true,
      });
      const last = lastCall();
      // Single-path URL has no query params for these flags.
      expect(last.url).to.equal(`${AEM_API}/${o}/sites/${s}/preview/x.html`);
      expect(last.body).to.be.undefined;
    });

    it('aem.preview bulk folds forceUpdate/forceSync into JSON body', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await aem.preview({
        org: o, site: s, path: ['/a', '/b'], forceUpdate: true, forceSync: true,
      });
      const last = lastCall();
      expect(JSON.parse(last.body)).to.deep.equal({
        paths: ['/a', '/b'], forceUpdate: true, forceSync: true,
      });
    });

    it('aem.getPreview GETs', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await aem.getPreview({ org: o, site: s, path: '/x' });
      expect(lastCall().method).to.equal('GET');
    });

    it('aem.getPublish GETs /live', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await aem.getPublish({ org: o, site: s, path: '/x' });
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites/${s}/live/x`);
      expect(lastCall().method).to.equal('GET');
    });
  });

  describe('snapshot', () => {
    it('snapshot.list hits /snapshots on hlx6', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await snapshot.list({ org: o, site: s });
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites/${s}/snapshots`);
    });

    it('snapshot.list hits singular /snapshot on legacy', async () => {
      const { org: o, site: s } = makeOrgSite();
      await snapshot.list({ org: o, site: s });
      expect(lastCall().url).to.equal(`${HLX_ADMIN}/snapshot/${o}/${s}/main`);
    });

    it('snapshot.get retrieves manifest', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await snapshot.get({ org: o, site: s, snapshotId: 'snap1' });
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites/${s}/snapshots/snap1`);
    });

    it('snapshot.update POSTs body', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await snapshot.update({ org: o, site: s, snapshotId: 'snap1', body: { title: 'hi' } });
      const last = lastCall();
      expect(last.method).to.equal('POST');
      expect(JSON.parse(last.body)).to.deep.equal({ title: 'hi' });
    });

    it('snapshot.delete DELETEs', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await snapshot.delete({ org: o, site: s, snapshotId: 'snap1' });
      expect(lastCall().method).to.equal('DELETE');
    });

    it('snapshot.addPath single POSTs to snapshotId/{path}', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await snapshot.addPath({ org: o, site: s, snapshotId: 'snap1', path: '/x.html' });
      const last = lastCall();
      expect(last.url).to.equal(`${AEM_API}/${o}/sites/${s}/snapshots/snap1/x.html`);
      expect(last.method).to.equal('POST');
    });

    it('snapshot.addPath bulk POSTs to /* with paths', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await snapshot.addPath({ org: o, site: s, snapshotId: 'snap1', path: ['/a', '/b'] });
      const last = lastCall();
      expect(last.url).to.equal(`${AEM_API}/${o}/sites/${s}/snapshots/snap1/*`);
      expect(JSON.parse(last.body)).to.deep.equal({ paths: ['/a', '/b'] });
    });

    it('snapshot.removePath bulk includes delete:true', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await snapshot.removePath({ org: o, site: s, snapshotId: 'snap1', path: ['/a', '/b'] });
      const last = lastCall();
      expect(last.method).to.equal('POST');
      expect(JSON.parse(last.body)).to.deep.equal({ paths: ['/a', '/b'], delete: true });
    });

    it('snapshot.publish adds publish=true', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await snapshot.publish({ org: o, site: s, snapshotId: 'snap1' });
      const u = new URL(lastCall().url);
      expect(u.searchParams.get('publish')).to.equal('true');
    });

    it('snapshot.review adds review=action', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await snapshot.review({ org: o, site: s, snapshotId: 'snap1', action: 'approve' });
      const u = new URL(lastCall().url);
      expect(u.searchParams.get('review')).to.equal('approve');
    });
  });

  describe('jobs', () => {
    it('jobs.get with name on hlx6', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await jobs.get({ org: o, site: s, topic: 'preview', name: 'job-123' });
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites/${s}/jobs/preview/job-123`);
    });

    it('jobs.get without name lists topic', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await jobs.get({ org: o, site: s, topic: 'preview' });
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites/${s}/jobs/preview`);
    });

    it('jobs.get legacy uses singular /job', async () => {
      const { org: o, site: s } = makeOrgSite();
      await jobs.get({ org: o, site: s, topic: 'preview', name: 'job-123' });
      expect(lastCall().url).to.equal(`${HLX_ADMIN}/job/${o}/${s}/main/preview/job-123`);
    });

    it('jobs.details GETs /details', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await jobs.details({ org: o, site: s, topic: 'preview', name: 'j1' });
      expect(lastCall().url).to.equal(`${AEM_API}/${o}/sites/${s}/jobs/preview/j1/details`);
    });

    it('jobs.stop DELETEs', async () => {
      const { org: o, site: s } = makeOrgSite({ hlx6: true });
      await jobs.stop({ org: o, site: s, topic: 'preview', name: 'j1' });
      expect(lastCall().method).to.equal('DELETE');
    });
  });

  describe('fromPath', () => {
    it('splits /org/site/file/path into { org, site, path }', () => {
      expect(fromPath('/adobe/aem-boilerplate/index.html')).to.deep.equal({
        org: 'adobe',
        site: 'aem-boilerplate',
        path: '/index.html',
      });
    });

    it('handles deep paths', () => {
      expect(fromPath('/adobe/site/folder/sub/page.html')).to.deep.equal({
        org: 'adobe',
        site: 'site',
        path: '/folder/sub/page.html',
      });
    });

    it('returns empty path when only org/site present', () => {
      expect(fromPath('/adobe/site')).to.deep.equal({
        org: 'adobe',
        site: 'site',
        path: '',
      });
    });
  });

  describe('hlx6ToDaList', () => {
    it('passes through items without content-type unchanged', () => {
      const items = [{ name: 'foo', path: '/foo' }];
      expect(hlx6ToDaList('/parent', items)).to.deep.equal(items);
    });

    it('strips trailing slash for folders', () => {
      const result = hlx6ToDaList('/parent', [
        { name: 'subfolder/', 'content-type': 'application/folder' },
      ]);
      expect(result[0].name).to.equal('subfolder');
      expect(result[0].path).to.equal('/parent/subfolder');
    });

    it('extracts ext and strips it from display name', () => {
      const result = hlx6ToDaList('/parent', [
        { name: 'page.html', 'content-type': 'text/html' },
      ]);
      expect(result[0].name).to.equal('page');
      expect(result[0].ext).to.equal('html');
      expect(result[0].path).to.equal('/parent/page.html');
    });

    it('converts last-modified to unix timestamp', () => {
      const result = hlx6ToDaList('/parent', [
        { name: 'x.html', 'content-type': 'text/html', 'last-modified': '2025-01-01T00:00:00.000Z' },
      ]);
      expect(result[0].lastModified).to.equal(new Date('2025-01-01T00:00:00.000Z').getTime());
    });
  });

  describe('signout', () => {
    it('hits DA_ADMIN/logout', async () => {
      signout();
      // signout is fire-and-forget; await microtask
      await Promise.resolve();
      await Promise.resolve();
      const logoutCalls = callsTo(DA_ADMIN).filter((c) => c.url.endsWith('/logout'));
      expect(logoutCalls.length).to.be.greaterThan(0);
    });
  });
});
