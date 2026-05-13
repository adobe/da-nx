import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setConfig } from '../../../../scripts/nx.js';
import { setMockIms, resetMockIms } from '../../../mocks/ims.js';
import {
  SUPPORTED_FILES,
  DA_ADMIN,
  DA_COLLAB,
  DA_CONTENT,
  DA_PREVIEW,
  DA_ETC,
  HLX_ADMIN,
  AEM_API,
  ALLOWED_TOKEN,
  hashChange,
  loadStyle,
} from '../../../../utils/utils.js';
import { daFetch, signout } from '../../../../utils/api.js';

// ─── SUPPORTED_FILES ────────────────────────────────────────────────────────

describe('SUPPORTED_FILES', () => {
  it('maps html to text/html', () => {
    expect(SUPPORTED_FILES.html).to.equal('text/html');
  });

  it('maps json to application/json', () => {
    expect(SUPPORTED_FILES.json).to.equal('application/json');
  });

  it('maps svg to image/svg+xml', () => {
    expect(SUPPORTED_FILES.svg).to.equal('image/svg+xml');
  });

  it('contains all expected extensions', () => {
    const expected = ['html', 'jpeg', 'json', 'jpg', 'png', 'gif', 'mp4', 'pdf', 'svg', 'ico'];
    expect(Object.keys(SUPPORTED_FILES)).to.include.members(expected);
  });
});

// ─── Environment constants ──────────────────────────────────────────────────

describe('DA environment constants', () => {
  it('DA_ADMIN is an http(s) URL', () => {
    expect(DA_ADMIN).to.be.a('string');
    expect(DA_ADMIN).to.match(/^https?:\/\//);
  });

  it('DA_COLLAB is a websocket URL', () => {
    expect(DA_COLLAB).to.be.a('string');
    expect(DA_COLLAB).to.match(/^wss?:\/\//);
  });

  it('DA_CONTENT is an http(s) URL', () => {
    expect(DA_CONTENT).to.match(/^https?:\/\//);
  });

  it('DA_PREVIEW is an http(s) URL', () => {
    expect(DA_PREVIEW).to.match(/^https?:\/\//);
  });

  it('HLX_ADMIN is admin.hlx.page', () => {
    expect(HLX_ADMIN).to.equal('https://admin.hlx.page');
  });

  it('AEM_API is api.aem.live', () => {
    expect(AEM_API).to.equal('https://api.aem.live');
  });

  it('ALLOWED_TOKEN includes all DA origins plus HLX and AEM', () => {
    expect(ALLOWED_TOKEN).to.include(DA_ADMIN);
    expect(ALLOWED_TOKEN).to.include(DA_COLLAB);
    expect(ALLOWED_TOKEN).to.include(DA_CONTENT);
    expect(ALLOWED_TOKEN).to.include(DA_PREVIEW);
    expect(ALLOWED_TOKEN).to.include(DA_ETC);
    expect(ALLOWED_TOKEN).to.include(AEM_API);
    expect(ALLOWED_TOKEN).to.include(HLX_ADMIN);
  });
});

// ─── hashChange ─────────────────────────────────────────────────────────────

describe('hashChange', () => {
  let savedHash;

  beforeEach(() => {
    savedHash = window.location.hash;
  });

  afterEach(() => {
    history.replaceState(null, '', savedHash || ' ');
  });

  it('calls subscriber immediately with current parsed hash', () => {
    window.location.hash = '#/testorg/testsite';
    let result;
    const unsub = hashChange.subscribe((state) => { result = state; });
    expect(result).to.not.be.null;
    expect(result.org).to.equal('testorg');
    expect(result.site).to.equal('testsite');
    expect(result.path).to.be.null;
    unsub();
  });

  it('returns null for empty hash', () => {
    history.replaceState(null, '', ' ');
    let result = 'unset';
    const unsub = hashChange.subscribe((state) => { result = state; });
    expect(result).to.be.null;
    unsub();
  });

  it('parses org only (no site or path)', () => {
    window.location.hash = '#/myorg';
    let result;
    const unsub = hashChange.subscribe((state) => { result = state; });
    expect(result.org).to.equal('myorg');
    expect(result.site).to.be.null;
    expect(result.path).to.be.null;
    unsub();
  });

  it('parses org, site, and deep path', () => {
    window.location.hash = '#/myorg/mysite/folder/page';
    let result;
    const unsub = hashChange.subscribe((state) => { result = state; });
    expect(result.org).to.equal('myorg');
    expect(result.site).to.equal('mysite');
    expect(result.path).to.equal('folder/page');
    unsub();
  });

  it('always includes a view property', () => {
    window.location.hash = '#/org';
    let result;
    const unsub = hashChange.subscribe((state) => { result = state; });
    expect(result).to.have.property('view');
    expect(result.view).to.be.a('string');
    unsub();
  });

  it('strips /index suffix from hash via replaceState', () => {
    window.location.hash = '#/org/site/path/index';
    let result;
    const unsub = hashChange.subscribe((state) => { result = state; });
    expect(window.location.hash).to.not.include('index');
    expect(result.org).to.equal('org');
    expect(result.site).to.equal('site');
    unsub();
  });

  it('unsubscribe stops future notifications', (done) => {
    let callCount = 0;
    const unsub = hashChange.subscribe(() => { callCount += 1; });
    expect(callCount).to.equal(1);
    unsub();

    window.location.hash = '#/anotherorg/anothersite';
    setTimeout(() => {
      expect(callCount).to.equal(1);
      done();
    }, 100);
  });

  it('notifies subscribers on hashchange', (done) => {
    const results = [];
    const unsub = hashChange.subscribe((state) => { results.push(state); });

    window.location.hash = '#/eventorg/eventsite';

    setTimeout(() => {
      const last = results[results.length - 1];
      expect(last).to.not.be.null;
      expect(last.org).to.equal('eventorg');
      expect(last.site).to.equal('eventsite');
      unsub();
      done();
    }, 100);
  });
});

// ─── loadStyle ──────────────────────────────────────────────────────────────

describe('loadStyle', () => {
  it('returns the same promise for repeated calls (caching)', () => {
    const p1 = loadStyle('/nx2/test/mocks/test.js');
    const p2 = loadStyle('/nx2/test/mocks/test.js');
    expect(p1).to.equal(p2);
  });

  it('replaces .js with .css in the path', async () => {
    const sheet = await loadStyle('/nx2/test/mocks/test.js');
    expect(sheet).to.be.instanceOf(CSSStyleSheet);
  });
});

// ─── api ────────────────────────────────────────────────────────────────────

const mockResp = (body = {}, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
  headers: { get: () => null },
});

describe('api', () => {
  const originalFetch = window.fetch;
  let fetchStub;

  before(async () => {
    await setConfig({ locales: { '': {} }, log: () => {} });
  });

  beforeEach(() => {
    fetchStub = sinon.stub();
    window.fetch = fetchStub;
    resetMockIms();
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  // ─── daFetch ──────────────────────────────────────────────────────────────

  describe('daFetch', () => {
    it('attaches Authorization header for allowed origins', async () => {
      fetchStub.resolves(mockResp());
      await daFetch({ url: `${DA_ADMIN}/some/path` });
      const [, opts] = fetchStub.firstCall.args;
      expect(opts.headers.Authorization).to.equal('Bearer test-token');
    });

    it('skips token for non-allowed origins', async () => {
      fetchStub.resolves(mockResp());
      await daFetch({ url: 'https://random-site.com/api' });
      const [, opts] = fetchStub.firstCall.args;
      expect(opts.headers.Authorization).to.be.undefined;
    });

    it('returns empty object when user is anonymous', async () => {
      setMockIms({ anonymous: true });
      const resp = await daFetch({ url: `${DA_ADMIN}/test` });
      expect(resp).to.deep.equal({});
      expect(fetchStub.called).to.be.false;
    });

    it('adds x-content-source-authorization for HLX_ADMIN', async () => {
      fetchStub.resolves(mockResp());
      await daFetch({ url: `${HLX_ADMIN}/some/path` });
      const [, opts] = fetchStub.firstCall.args;
      expect(opts.headers['x-content-source-authorization']).to.equal('Bearer test-token');
      expect(opts.headers.Authorization).to.equal('Bearer test-token');
    });

    it('adds x-content-source-authorization for AEM_API', async () => {
      fetchStub.resolves(mockResp());
      await daFetch({ url: `${AEM_API}/some/path` });
      const [, opts] = fetchStub.firstCall.args;
      expect(opts.headers['x-content-source-authorization']).to.equal('Bearer test-token');
    });

    it('defaults to GET method', async () => {
      fetchStub.resolves(mockResp());
      await daFetch({ url: `${DA_ADMIN}/test` });
      const [, opts] = fetchStub.firstCall.args;
      expect(opts.method).to.equal('GET');
    });

    it('passes through custom opts', async () => {
      fetchStub.resolves(mockResp());
      await daFetch({
        url: `${DA_ADMIN}/test`,
        opts: { method: 'POST', headers: {}, body: 'data' },
      });
      const [, opts] = fetchStub.firstCall.args;
      expect(opts.method).to.equal('POST');
      expect(opts.body).to.equal('data');
    });
  });

  // ─── signout ──────────────────────────────────────────────────────────────

  describe('signout', () => {
    it('is a callable function', () => {
      expect(signout).to.be.a('function');
    });
  });
});
