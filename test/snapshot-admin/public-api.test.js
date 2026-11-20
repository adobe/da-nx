import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { createSnapshotApi } from '../../nx/public/snapshot/api.js';

const BASE = 'https://admin.hlx.page/snapshot/org/site/main';
const DA = 'https://admin.da.live';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

describe('Public snapshot API', () => {
  let fetch;

  beforeEach(() => {
    sinon.stub(window, 'fetch').throws(new Error('Unexpected global fetch'));
  });

  afterEach(() => sinon.restore());

  const create = (handler, extra = {}) => {
    fetch = sinon.stub().callsFake(handler);
    return createSnapshotApi({
      fetch, org: 'org', site: 'site', pollInterval: 0, ...extra,
    });
  };

  it('requires a fetch function', () => {
    expect(() => createSnapshotApi({ org: 'org', site: 'site' })).to.throw(TypeError);
  });

  it('lists snapshots and formats manifest resources through the injected fetch', async () => {
    const api = create(async (url) => {
      if (url === BASE) return json({ snapshots: ['s1'] });
      return json({ manifest: { resources: [{ path: '/a' }] } });
    });
    expect(await api.list()).to.deep.equal({ snapshots: [{ org: 'org', site: 'site', name: 's1' }] });
    const manifest = await api.getManifest({ name: 's1' });
    expect(manifest.resources[0].url).to.equal('https://s1--main--site--org.aem.reviews/a');
    expect(manifest.resources[0].daSnapshotEdit).to.equal('https://da.live/edit#/org/site/.snapshots/s1/a');
  });

  it('returns an error shape with status on failure', async () => {
    const api = create(async () => new Response('', { status: 403 }));
    const result = await api.review({ name: 's1', state: 'request' });
    expect(result.status).to.equal(403);
    expect(result.error).to.be.a('string');
  });

  it('polls bulk jobs until stopped', async () => {
    const states = ['running', 'stopped'];
    const api = create(async (url) => {
      if (url === `${BASE}/s1/*`) return json({ links: { self: 'https://job' } }, 202);
      return json({ state: states.shift() });
    });
    const result = await api.addPaths({ name: 's1', paths: ['/a'] });
    expect(result).to.deep.equal({ success: true });
    expect(fetch.args.filter(([url]) => url === 'https://job')).to.have.length(2);
  });

  it('returns the polling error when a bulk job cannot be read', async () => {
    const api = create(async (url) => {
      if (url === `${BASE}/s1/*`) return json({ links: { self: 'https://job' } }, 202);
      return new Response('', { status: 500 });
    });
    const result = await api.addPaths({ name: 's1', paths: ['/a'] });
    expect(result.status).to.equal(500);
    expect(result.error).to.be.a('string');
  });

  it('returns an error when the snapshot source cannot be deleted', async () => {
    const api = create(async (url, opts) => {
      if (url.includes('/source/') && opts?.method === 'DELETE') return new Response('', { status: 500 });
      return new Response('', { status: 200 });
    });
    const result = await api.deleteSnapshot({ name: 's1' });
    expect(result.status).to.equal(500);
    expect(fetch.args.some(([url, opts]) => url === `${BASE}/s1` && opts?.method === 'DELETE')).to.equal(false);
  });

  it('returns an error shape instead of throwing on network failure', async () => {
    const api = create(async () => { throw new TypeError('Failed to fetch'); });
    expect(await api.list()).to.deep.equal({ error: 'Failed to fetch', status: 0 });
    const [url] = await api.copyResources({
      name: 's1', resources: [{ path: '/a.json', aemPreview: 'https://main--site--org.aem.page/a.json' }], direction: 'fork',
    });
    expect(url).to.include({ path: '/a.json', status: 'error' });
  });

  it('uses the DA source adapter by default and the supplied source when given', async () => {
    const defaults = create(async () => new Response('', { status: 200 }));
    expect(await defaults.hasSnapshotSource({ name: 's1', path: '/a' })).to.equal(true);
    expect(fetch.args[0]).to.deep.equal([`${DA}/source/org/site/.snapshots/s1/a.html`, { method: 'HEAD' }]);

    const getMetadata = sinon.stub().resolves({ ok: false, status: 404 });
    const custom = create(async () => new Response(''), { source: { getMetadata } });
    expect(await custom.hasSnapshotSource({ name: 's1', path: '/b.json' })).to.equal(false);
    expect(getMetadata.calledOnceWithExactly('/org/site/.snapshots/s1/b.json')).to.equal(true);
  });

  it('reports an unknown snapshot source when the check fails', async () => {
    const failing = create(async () => new Response('', { status: 500 }));
    expect(await failing.hasSnapshotSource({ name: 's1', path: '/a' })).to.equal(null);
    const offline = create(async () => { throw new TypeError('Failed to fetch'); });
    expect(await offline.hasSnapshotSource({ name: 's1', path: '/a' })).to.equal(null);
  });

  it('returns an error when a bulk job stops with an error or is cancelled', async () => {
    const jobs = [{ state: 'stopped', error: 'boom' }, { state: 'stopped', cancelled: true }];
    const api = create(async (url) => {
      if (url === `${BASE}/s1/*`) return json({ links: { self: 'https://job' } }, 202);
      return json(jobs.shift());
    });
    expect((await api.addPaths({ name: 's1', paths: ['/a'] })).error).to.equal('boom');
    expect((await api.addPaths({ name: 's1', paths: ['/a'] })).error).to.be.a('string');
  });

  it('returns an error message when a single page copy fails', async () => {
    const get = sinon.stub().resolves(new Response('', { status: 404 }));
    const api = create(async () => new Response('', { status: 201 }), { source: { get } });
    const result = await api.copyPage({ name: 's1', path: '/data.json', direction: 'fork' });
    expect(result.status).to.equal('error');
    expect(result.error).to.be.a('string');
  });

  it('copies a single page and reports its status', async () => {
    const get = sinon.stub().resolves(new Response('{}', { headers: { 'content-type': 'application/json' } }));
    const api = create(async () => new Response('', { status: 201 }), { source: { get } });
    const result = await api.copyPage({ name: 's1', path: '/data.json', direction: 'fork' });
    expect(result.status).to.equal('success');
    expect(get.calledOnceWithExactly('/org/site/data.json')).to.equal(true);
    expect(fetch.args[0][0]).to.equal(`${DA}/source/org/site/.snapshots/s1/data.json`);
  });

  it('rejects invalid single-page copies without any request', async () => {
    const api = create(async () => new Response(''));
    expect((await api.copyPage({ name: 's1', direction: 'promote', mode: 'overwrite' })).status).to.equal(400);
    expect((await api.copyPage({ name: 's1', path: '/a', direction: 'sideways' })).status).to.equal(400);
    expect(fetch.called).to.equal(false);
  });

  it('checks the index document for directory paths', async () => {
    const getMetadata = sinon.stub().resolves({ ok: true });
    const api = create(async () => new Response(''), { source: { getMetadata } });
    await api.hasSnapshotSource({ name: 's1', path: '/' });
    await api.hasSnapshotSource({ name: 's1', path: '/docs/' });
    expect(getMetadata.args.map(([p]) => p)).to.deep.equal([
      '/org/site/.snapshots/s1/index.html',
      '/org/site/.snapshots/s1/docs/index.html',
    ]);
  });

  it('lets the site config override the org config for launch permission', async () => {
    const api = create(async (url) => {
      const value = url.endsWith('/org/site/') ? 'false' : 'true';
      return json({ data: [{ key: 'snapshot.launch', value }] });
    });
    expect(await api.getLaunchPermission()).to.equal(false);
    expect(await api.getLaunchPermission()).to.equal(false);
    expect(fetch.callCount).to.equal(2);
  });
});
