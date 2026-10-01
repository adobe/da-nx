import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { createCopy, createConfigLoader } from '../../nx/utils/loc.js';
import * as loc from '../../nx/public/utils/loc.js';

const ORIGIN = 'https://admin.da.live';
const SOURCE = '/source-org/source-site/en/page.html';
const DESTINATION = '/target-org/target-site/fr/page.html';
const html = (text) => `<body><main><div><p>${text}</p></div></main></body>`;

describe('Shared loc copy', () => {
  let fetch;
  let loadConfig;
  let copy;
  let globalFetch;

  beforeEach(() => {
    globalFetch = sinon.stub(window, 'fetch').throws(new Error('Unexpected global fetch'));
    fetch = sinon.stub().callsFake(async (href, opts) => {
      if (opts?.method === 'POST') return new Response('{}');
      return new Response(html(href.endsWith(SOURCE) ? 'Upstream' : 'Regional'));
    });
    loadConfig = sinon.stub().resolves({ config: { data: [] } });
    copy = createCopy({ fetch, loadConfig, daOrigin: ORIGIN });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('merges across sites using injected fetch and destination configuration', async () => {
    const url = { source: SOURCE, destination: DESTINATION };
    const result = await copy.mergeCopy(url, 'SDK Merge');
    expect(result.ok).to.equal(true);
    expect(url.status).to.equal('success');
    expect(loadConfig.calledOnceWithExactly({ org: 'target-org', site: 'target-site' })).to.equal(true);
    expect(fetch.args.map(([href]) => href)).to.deep.equal([
      `${ORIGIN}/source${DESTINATION}`,
      `${ORIGIN}/source${SOURCE}`,
      `${ORIGIN}/source${DESTINATION}`,
      `${ORIGIN}/versionsource${DESTINATION}`,
    ]);
    const [, opts] = fetch.args[2];
    const saved = await opts.body.get('data').text();
    expect(saved).to.include('da-diff-added');
    expect(globalFetch.called).to.equal(false);
  });

  it('uses destination configuration when normalizing equivalent source sites', async () => {
    fetch.callsFake(async (href) => new Response(html(
      `<a href="https://main--${href.endsWith(SOURCE) ? 'source-site' : 'target-site'}--target-org.aem.live/page">Link</a>`,
    )));
    loadConfig.resolves({
      config: { data: [{ key: 'source.fragment.hostnames', value: 'main--source-site--target-org.aem.live' }] },
    });
    const result = await copy.mergeCopy({ source: SOURCE, destination: DESTINATION }, 'Merge');
    expect(result.ok).to.equal(true);
    expect(loadConfig.firstCall.args[0]).to.deep.equal({ org: 'target-org', site: 'target-site' });
    const saved = await fetch.args[2][1].body.get('data').text();
    expect(saved).to.include('main--target-site--target-org.aem.live');
    expect(saved).not.to.include('da-diff-added');
  });

  it('does not write when documents are identical', async () => {
    fetch.callsFake(async () => new Response(html('Same')));
    const result = await copy.mergeCopy({ source: SOURCE, destination: DESTINATION }, 'Merge');
    expect(result.ok).to.equal(true);
    expect(fetch.callCount).to.equal(2);
    expect(loadConfig.called).to.equal(false);
  });

  it('overwrites a missing destination and removes old diff annotations', async () => {
    fetch.onFirstCall().resolves(new Response('', { status: 404 }));
    fetch.onSecondCall().resolves(new Response(html('<span da-diff-added>Keep</span><da-diff-deleted>Remove</da-diff-deleted>')));
    const result = await copy.mergeCopy({ source: SOURCE, destination: DESTINATION }, 'Merge');
    expect(result.ok).to.equal(true);
    const saved = await fetch.args[2][1].body.get('data').text();
    expect(saved).to.include('Keep');
    expect(saved).not.to.include('Remove');
    expect(saved).not.to.include('da-diff-added');
  });

  it('reports unauthorized reads without falling back to overwrite', async () => {
    fetch.onFirstCall().resolves(new Response('', { status: 401 }));
    const url = { source: SOURCE, destination: DESTINATION, sourceContent: html('Upstream') };
    const result = await copy.mergeCopy(url, 'Merge');
    expect(result.ok).to.equal(false);
    expect(result.status).to.equal(401);
    expect(result.error).to.include('401');
    expect(url.status).to.equal('error');
    expect(fetch.callCount).to.equal(1);
  });

  it('reports configuration failures without overwriting the regional content', async () => {
    loadConfig.rejects(new Error('Configuration unavailable'));
    const result = await copy.mergeCopy({ source: SOURCE, destination: DESTINATION }, 'Merge');
    expect(result.ok).to.equal(false);
    expect(result.error).to.equal('Configuration unavailable');
    expect(fetch.callCount).to.equal(2);
  });

  it('allows da-nx to retain its backend-aware rendered-source saver', async () => {
    const saveSource = sinon.stub().resolves(new Response('{}'));
    copy = createCopy({
      fetch, loadConfig, daOrigin: ORIGIN, saveSource,
    });
    const result = await copy.mergeCopy({ source: SOURCE, destination: DESTINATION }, 'Merge');
    expect(result.ok).to.equal(true);
    expect(saveSource.calledOnce).to.equal(true);
    expect(saveSource.firstCall.args[0]).to.include({
      org: 'target-org', site: 'target-site', path: '/fr/page.html',
    });
    expect(fetch.args.some(([href]) => href === `${ORIGIN}/versionsource${DESTINATION}`)).to.equal(true);
  });

  it('deduplicates concurrent versions and keeps JSON uploads intact', async () => {
    await Promise.all(Array.from({ length: 6 }, () => copy.overwriteCopy({
      source: SOURCE, destination: '/target-org/target-site/data.json', sourceContent: '{"a":1}',
    }, 'Copy')));
    const versions = fetch.args.filter(([href]) => href.includes('/versionsource'));
    expect(versions.length).to.equal(1);
    expect(JSON.parse(versions[0][1].body)).to.deep.equal({ label: 'Copy - Rolled Out' });
    const uploaded = fetch.args[0][1].body.get('data');
    expect(uploaded.type).to.equal('application/json');
    expect(await uploaded.text()).to.equal('{"a":1}');
  });

  it('rolls out annotated content using the same injected dependencies', async () => {
    const url = { source: SOURCE, destination: DESTINATION };
    await copy.rolloutCopy(url, 'Rollout', { labelLocal: 'Local', labelUpstream: 'Upstream' });
    expect(url.status).to.equal('success');
    const saved = await fetch.args[2][1].body.get('data').text();
    expect(saved).to.include('diff-label-local');
    expect(saved).to.include('diff-label-upstream');
    expect(loadConfig.firstCall.args[0]).to.deep.equal({ org: 'target-org', site: 'target-site' });
  });

  it('retains the 20-second rollout save timeout', async () => {
    const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let notifySaving;
    const saving = new Promise((resolve) => { notifySaving = resolve; });
    fetch.callsFake(async (href, opts) => {
      if (opts?.method === 'POST') {
        notifySaving();
        return new Promise(() => {});
      }
      return new Response(html(href.endsWith(SOURCE) ? 'Upstream' : 'Regional'));
    });
    const url = { source: SOURCE, destination: DESTINATION };
    const promise = copy.rolloutCopy(url, 'Rollout');
    await saving;
    await clock.tickAsync(19999);
    expect(url.status).not.to.equal('timeout');
    await clock.tickAsync(1);
    expect(await promise).to.equal('timeout');
    expect(url.status).to.equal('timeout');
  });

  it('reports a failed version save instead of leaving an unhandled rejection', async () => {
    fetch.callsFake(async (href) => (
      href.includes('/versionsource') ? new Response('', { status: 403 }) : new Response('{}')
    ));
    const url = { destination: DESTINATION, sourceContent: html('Source') };
    const result = await copy.overwriteCopy(url, 'Copy');
    expect(result.ok).to.equal(false);
    expect(result.error).to.equal('Version save failed (403)');
    expect(url.status).to.equal('error');
  });
});

describe('Shared loc configuration loader', () => {
  it('isolates site caches and falls back to org config only on 404', async () => {
    const fetch = sinon.stub().callsFake(async (href) => {
      if (href.includes('/site-one/')) return new Response('', { status: 404 });
      return new Response(JSON.stringify({ config: { data: [{ key: 'site', value: href }] } }));
    });

    const loadConfig = createConfigLoader({ fetch, daOrigin: ORIGIN });
    const first = await loadConfig({ org: 'org', site: 'site-one' });
    const second = await loadConfig({ org: 'org', site: 'site-two' });
    expect(first).not.to.deep.equal(second);
    expect(await loadConfig({ org: 'org', site: 'site-one' })).to.equal(first);
    expect(fetch.callCount).to.equal(3);
  });

  it('does not hide an authorization failure behind org or default configuration', async () => {
    const fetch = sinon.stub().resolves(new Response('', { status: 403 }));
    const loadConfig = createConfigLoader({ fetch, daOrigin: ORIGIN });
    try {
      await loadConfig({ org: 'org', site: 'site' });
      expect.fail('Expected an authorization error');
    } catch (error) {
      expect(error.message).to.include('403');
    }
    expect(fetch.callCount).to.equal(1);
  });
});

describe('Public MSM merge factory', () => {
  it('exports only the merge factory and requires only fetch and DA origin', async () => {
    expect(Object.keys(loc)).to.deep.equal(['createMergeCopy']);
    const fetch = sinon.stub().callsFake(async (href, opts) => {
      if (href.endsWith('/.da/translate.json')) {
        return new Response(JSON.stringify({ config: { data: [] } }));
      }
      if (opts?.method === 'POST') return new Response('{}');
      return new Response(html(href.endsWith(SOURCE) ? 'Upstream' : 'Regional'));
    });
    const mergeCopy = loc.createMergeCopy({ fetch, daOrigin: ORIGIN });
    const result = await mergeCopy({ source: SOURCE, destination: DESTINATION }, 'MSM Merge');
    expect(result.ok).to.equal(true);
    expect(fetch.args.some(([href]) => (
      href === `${ORIGIN}/source/target-org/target-site/.da/translate.json`
    ))).to.equal(true);
  });
});
