import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { createCopy, createConfigLoader } from '../../nx/public/loc/index.js';
import * as loc from '../../nx/public/loc/index.js';

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

  it('keeps review hashes from every key spelling and saves them under the keys the editor reads', async () => {
    const own = loc.getDiffHash('<p>Regional</p>');
    fetch.callsFake(async (href, opts) => {
      if (opts?.method === 'POST') return new Response('{}');
      if (href.endsWith(SOURCE)) return new Response(html('Upstream'));
      return new Response(`${html('Regional')}<div class="da-metadata">
        <div><div>acceptedhashes</div><div>${own}</div></div>
        <div><div>acceptedHashes</div><div>0123456789ab</div></div>
        <div><div>rejectedhashes</div><div>ba9876543210</div></div>
      </div>`);
    });
    await copy.mergeCopy({ source: SOURCE, destination: DESTINATION }, 'Merge');
    const saved = await fetch.args[2][1].body.get('data').text();
    expect(saved).not.to.include('<p da-diff-added="">Regional</p>');
    expect(saved).to.include(`<div><div>acceptedHashes</div><div>${own},0123456789ab</div></div>`);
    expect(saved).to.include('<div><div>rejectedHashes</div><div>ba9876543210</div></div>');
    expect(saved).not.to.match(/acceptedhashes|rejectedhashes/);
  });

  it('rolls out into an existing empty destination without overwriting its metadata', async () => {
    fetch.callsFake(async (href, opts) => {
      if (opts?.method === 'POST') return new Response('{}');
      if (href.endsWith(SOURCE)) return new Response(html('Upstream'));
      return new Response('<body><main><div></div></main><div class="da-metadata"><div><div>keep</div><div>me</div></div></div></body>');
    });
    const url = { source: SOURCE, destination: DESTINATION };
    await copy.rolloutCopy(url, 'Rollout');
    expect(url.status).to.equal('success');
    expect(loadConfig.called).to.equal(true);
    const saved = await fetch.args[2][1].body.get('data').text();
    expect(saved).to.include('<da-diff-deleted><p>Upstream</p></da-diff-deleted>');
    expect(saved).to.include('<div>keep</div>');
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
      expect(error.message).to.equal('Reading translation config /org/site/.da/translate.json failed (403)');
    }
    expect(fetch.callCount).to.equal(1);
  });
});

describe('Public localization core', () => {
  it('exports copy, diff, tag, and hash APIs without application context', async () => {
    expect(Object.keys(loc).sort()).to.deep.equal([
      'ACCEPTED_KEY', 'HASH_LENGTH', 'REJECTED_KEY', 'createConfigLoader', 'createCopy',
      'getDiffHash', 'mergeCopy', 'normalizeLinks', 'overwriteCopy', 'regionalDiff', 'removeLocTags',
    ].sort());
    expect(loc.ACCEPTED_KEY).to.equal('acceptedHashes');
    expect(loc.REJECTED_KEY).to.equal('rejectedHashes');
    expect(loc.getDiffHash('<p>Content</p>')).to.equal(window.objectHash('<p>Content</p>').substring(0, 12));
    expect(loc.HASH_LENGTH).to.equal(12);
  });

  it('accepts explicit fetch, origin, paths, and message', async () => {
    const fetch = sinon.stub().callsFake(async (href, opts) => {
      if (href.endsWith('/.da/translate.json')) {
        return new Response(JSON.stringify({ config: { data: [] } }));
      }
      if (opts?.method === 'POST') return new Response('{}');
      return new Response(html(href.endsWith(SOURCE) ? 'Upstream' : 'Regional'));
    });
    const result = await loc.mergeCopy({
      fetch, daOrigin: ORIGIN, urlSource: SOURCE, urlTarget: DESTINATION, msg: 'MSM Merge',
    });
    expect(result).to.deep.equal({ ok: true, status: 200 });
    expect(fetch.args.some(([href]) => (
      href === `${ORIGIN}/source/target-org/target-site/.da/translate.json`
    ))).to.equal(true);
  });

  it('reports the unreadable org config after a missing site config without writing', async () => {
    const fetch = sinon.stub().callsFake(async (href) => {
      if (href === `${ORIGIN}/source/target-org/target-site/.da/translate.json`) {
        return new Response('', { status: 404 });
      }
      if (href === `${ORIGIN}/source/target-org/.da/translate.json`) {
        return new Response('', { status: 403 });
      }
      return new Response(html(href.endsWith(SOURCE) ? 'Upstream' : 'Regional'));
    });
    const result = await loc.mergeCopy({
      fetch, daOrigin: ORIGIN, urlSource: SOURCE, urlTarget: DESTINATION, msg: 'MSM Merge',
    });
    expect(result).to.deep.equal({
      ok: false,
      status: 403,
      error: 'Reading translation config /target-org/.da/translate.json failed (403)',
    });
    expect(fetch.args.map(([href]) => href)).to.deep.equal([
      `${ORIGIN}/source${DESTINATION}`,
      `${ORIGIN}/source${SOURCE}`,
      `${ORIGIN}/source/target-org/target-site/.da/translate.json`,
      `${ORIGIN}/source/target-org/.da/translate.json`,
    ]);
    expect(fetch.args.every(([, opts]) => !opts?.method)).to.equal(true);
  });

  it('exposes overwrite without loading merge configuration and clears review hashes', async () => {
    const fetch = sinon.stub().callsFake(async (href, opts) => {
      if (opts?.method === 'POST') return new Response('{}');
      return new Response(`${html('<span da-diff-added>Keep</span><da-diff-deleted>Remove</da-diff-deleted>')}
        <div class="da-metadata">
          <div><div>acceptedHashes</div><div>abc</div></div>
          <div><div>rejectedHashes</div><div>def</div></div>
        </div>`);
    });
    const result = await loc.overwriteCopy({
      fetch, daOrigin: ORIGIN, urlSource: SOURCE, urlTarget: DESTINATION, msg: 'Copy',
    });
    expect(result).to.deep.equal({ ok: true, status: 200 });
    expect(fetch.callCount).to.equal(3);
    const saved = await fetch.args[1][1].body.get('data').text();
    expect(saved).to.include('Keep');
    expect(saved).not.to.include('Remove');
    expect(saved).not.to.include('da-diff-added');
    expect(saved).not.to.include('acceptedhashes');
    expect(saved).not.to.include('rejectedhashes');
  });

  it('passes translated content, connector image normalization, and review labels', async () => {
    const fetch = sinon.stub().callsFake(async (href, opts) => {
      if (href.endsWith('/.da/translate.json')) return new Response(JSON.stringify({ config: { data: [] } }));
      if (opts?.method === 'POST') return new Response('{}');
      return new Response(html('Regional'));
    });
    const normalizeImages = sinon.spy();
    const result = await loc.mergeCopy({
      fetch,
      daOrigin: ORIGIN,
      urlTarget: DESTINATION,
      sourceContent: html('Translated'),
      normalizeImages,
      msg: 'Translate',
      labelLocal: 'Regional',
      labelUpstream: 'Translation',
    });
    expect(result.ok).to.equal(true);
    expect(normalizeImages.calledOnce).to.equal(true);
    expect(fetch.args.some(([href]) => href.endsWith(SOURCE))).to.equal(false);
    const saved = await fetch.args.find(([href, opts]) => (
      href === `${ORIGIN}/source${DESTINATION}` && opts?.method === 'POST'
    ))[1].body.get('data').text();
    expect(saved).to.include('Translated');
    expect(saved).to.include('<div>diff-label-local</div><div>Regional</div>');
    expect(saved).to.include('<div>diff-label-upstream</div><div>Translation</div>');
  });

  it('returns a consistent result shape for no-op, failed write, and version failure', async () => {
    const run = (fetch) => loc.mergeCopy({
      fetch, daOrigin: 'https://shape.example', urlSource: SOURCE, urlTarget: DESTINATION, msg: 'Merge',
    });
    const reads = (body) => async (href, opts) => {
      if (href.endsWith('/.da/translate.json')) return new Response(JSON.stringify({ config: { data: [] } }));
      if (opts?.method === 'POST') return body(href);
      return new Response(html(href.endsWith(SOURCE) ? 'Upstream' : 'Regional'));
    };

    const same = await run(sinon.stub().callsFake(async () => new Response(html('Same'))));
    expect(same).to.deep.equal({ ok: true, status: 200 });

    const failedWrite = await run(sinon.stub().callsFake(reads(() => new Response('', { status: 412 }))));
    expect(failedWrite).to.deep.equal({ ok: false, status: 412, error: 'Save failed (412)' });

    const failedVersion = await run(sinon.stub().callsFake(reads((href) => (
      new Response('{}', { status: href.includes('/versionsource') ? 500 : 200 })
    ))));
    expect(failedVersion).to.deep.equal({ ok: false, status: 500, error: 'Version save failed (500)' });
  });

  it('preserves host transport denials without falling back to ambient fetch', async () => {
    const ambientFetch = sinon.stub(window, 'fetch').throws(new Error('Unexpected ambient fetch'));
    const fetch = sinon.stub().rejects(Object.assign(new Error('Outside permitted scope'), {
      code: 'denied',
    }));
    try {
      const result = await loc.mergeCopy({
        fetch, daOrigin: ORIGIN, urlSource: SOURCE, urlTarget: DESTINATION, msg: 'Merge',
      });
      expect(result).to.deep.equal({
        ok: false, status: 500, error: 'Outside permitted scope', code: 'denied',
      });
      expect(fetch.calledOnceWithExactly(`${ORIGIN}/source${DESTINATION}`)).to.equal(true);
      expect(ambientFetch.called).to.equal(false);
    } finally {
      ambientFetch.restore();
    }
  });

  it('preserves a host connection error after a successful write without retrying', async () => {
    const fetch = sinon.stub().callsFake(async (href, opts) => {
      if (href.includes('/versionsource')) {
        throw Object.assign(new Error('Host connection closed'), { code: 'closed' });
      }
      if (opts?.method === 'POST') return new Response('{}');
      return new Response(html('Source'));
    });
    const result = await loc.overwriteCopy({
      fetch, daOrigin: ORIGIN, urlSource: SOURCE, urlTarget: DESTINATION, msg: 'Copy',
    });
    expect(result).to.deep.equal({
      ok: false, status: 500, error: 'Host connection closed', code: 'closed',
    });
    expect(fetch.callCount).to.equal(3);
  });

  it('reuses configuration and in-flight versions across concurrent direct calls', async () => {
    const fetch = sinon.stub().callsFake(async (href, opts) => {
      if (href.endsWith('/.da/translate.json')) {
        return new Response(JSON.stringify({ config: { data: [] } }));
      }
      if (href.includes('/versionsource')) {
        await new Promise((resolve) => { setTimeout(resolve, 0); });
        return new Response('{}');
      }
      if (opts?.method === 'POST') return new Response('{}');
      return new Response(html(href.endsWith(SOURCE) ? 'Upstream' : 'Regional'));
    });
    const results = await Promise.all(Array.from({ length: 3 }, () => loc.mergeCopy({
      fetch, daOrigin: ORIGIN, urlSource: SOURCE, urlTarget: DESTINATION, msg: 'MSM Merge',
    })));
    expect(results.every((result) => result.ok)).to.equal(true);
    expect(fetch.args.filter(([href]) => href.endsWith('/.da/translate.json'))).to.have.length(1);
    expect(fetch.args.filter(([href]) => href.includes('/versionsource'))).to.have.length(1);
    await loc.mergeCopy({
      fetch, daOrigin: 'https://other.example', urlSource: SOURCE, urlTarget: DESTINATION, msg: 'Merge',
    });
    expect(fetch.args.filter(([href]) => href.endsWith('/.da/translate.json'))).to.have.length(2);
  });
});
