import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import * as SDK from '../../nx/utils/sdk.js';

const ORIGIN = 'https://sdk-admin.example';
const SOURCE = '/org/source/en/page.html';
const TARGET = '/org/target/fr/page.html';
const html = (text) => `<body><main><div><p>${text}</p></div></main></body>`;

describe('SDK localization actions', () => {
  let fetch;
  let ambientFetch;

  beforeEach(() => {
    ambientFetch = sinon.stub(window, 'fetch').throws(new Error('Unexpected ambient fetch'));
    fetch = sinon.stub().callsFake(async (href, opts) => {
      if (href.endsWith('/.da/translate.json')) return new Response(JSON.stringify({ config: { data: [] } }));
      if (opts?.method === 'POST') return new Response('{}');
      return new Response(html(href.endsWith(SOURCE) ? 'Upstream' : 'Regional'));
    });
  });

  afterEach(() => sinon.restore());

  it('does not load the core or fetch content when creating actions', () => {
    const hash = window.objectHash;
    const actions = SDK.createLocActions({ fetch, daOrigin: ORIGIN });
    expect(Object.keys(actions)).to.deep.equal(['mergeCopy', 'overwriteCopy']);
    expect(window.objectHash).to.equal(hash);
    expect(fetch.called).to.equal(false);
    expect(ambientFetch.called).to.equal(false);
  });

  it('binds merge transport and origin, ignoring caller-supplied transport and hooks', async () => {
    const callerFetch = sinon.spy();
    const normalizeImages = sinon.spy();
    const actions = SDK.createLocActions({ fetch, daOrigin: ORIGIN });
    const result = await actions.mergeCopy({
      urlSource: SOURCE,
      urlTarget: TARGET,
      msg: 'SDK Merge',
      fetch: callerFetch,
      daOrigin: 'https://ignored.example',
      normalizeImages,
      labelLocal: 'Local',
      labelUpstream: 'Upstream',
    });
    expect(result).to.deep.equal({ ok: true, status: 200 });
    expect(fetch.args.every(([href]) => href.startsWith(ORIGIN))).to.equal(true);
    expect(fetch.args.some(([href]) => href === `${ORIGIN}/source/org/target/.da/translate.json`)).to.equal(true);
    expect(callerFetch.called).to.equal(false);
    expect(normalizeImages.called).to.equal(false);
    expect(ambientFetch.called).to.equal(false);
    const saved = await fetch.args.find(([href, opts]) => (
      href === `${ORIGIN}/source${TARGET}` && opts?.method === 'POST'
    ))[1].body.get('data').text();
    expect(saved).to.include('da-diff-added');
    expect(saved).to.include('<div>diff-label-local</div><div>Local</div>');
    expect(saved).to.include('<div>diff-label-upstream</div><div>Upstream</div>');
    expect(JSON.parse(fetch.lastCall.args[1].body)).to.deep.equal({ label: 'SDK Merge - Rolled Out' });
  });

  it('overwrites supplied content without source or config reads', async () => {
    const actions = SDK.createLocActions({ fetch, daOrigin: ORIGIN });
    const result = await actions.overwriteCopy({
      urlTarget: TARGET, sourceContent: html('Translated'), msg: 'SDK Copy',
    });
    expect(result).to.deep.equal({ ok: true, status: 200 });
    expect(fetch.args.map(([href]) => href)).to.deep.equal([
      `${ORIGIN}/source${TARGET}`, `${ORIGIN}/versionsource${TARGET}`,
    ]);
    expect(await fetch.firstCall.args[1].body.get('data').text()).to.equal(html('Translated'));
  });

  it('preserves transport error codes without retrying', async () => {
    fetch.rejects(Object.assign(new Error('Outside permitted scope'), { code: 'denied' }));
    const actions = SDK.createLocActions({ fetch, daOrigin: ORIGIN });
    expect(await actions.mergeCopy({ urlSource: SOURCE, urlTarget: TARGET, msg: 'Merge' }))
      .to.deep.equal({
        ok: false, status: 500, error: 'Outside permitted scope', code: 'denied',
      });
    expect(fetch.calledOnce).to.equal(true);
    expect(ambientFetch.called).to.equal(false);
  });

  it('adds loc actions to the initialized SDK without changing existing actions', async () => {
    const channel = new MessageChannel();
    try {
      window.dispatchEvent(new MessageEvent('message', {
        data: { ready: true, context: { org: 'org', repo: 'site' } },
        ports: [channel.port2],
      }));
      const { actions } = await SDK.default;
      expect(actions.loc.mergeCopy).to.be.a('function');
      expect(actions.loc.overwriteCopy).to.be.a('function');
      expect(actions.daFetch).to.be.a('function');
      expect(actions.sendHTML).to.be.a('function');
      expect(fetch.called).to.equal(false);
      expect(ambientFetch.called).to.equal(false);
    } finally {
      channel.port1.close();
      channel.port2.close();
    }
  });
});
