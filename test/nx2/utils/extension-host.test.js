import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  DA_ADMIN, DA_COLLAB, DA_CONTENT, AEM_API, HLX_ADMIN, ALLOWED_TOKEN,
} from '../../../nx2/utils/utils.js';
import {
  authorize, checkBody, parseWireRequest, PROXY_POLICY, connectExtension,
} from '../../../nx2/utils/extension-host.js';
import { createDaFetch } from '../../../nx2/utils/sdk.js';
import { DaFetchError, MSG } from '../../../nx2/utils/sdk-wire.js';

const scope = { org: 'acme', site: 'web' };

const ALLOWED = [
  ['GET', `${AEM_API}/acme/sites/web/snapshots`],
  ['GET', `${AEM_API}/acme/sites/web/snapshots/snap1`],
  ['POST', `${AEM_API}/acme/sites/web/snapshots/snap1/en/page`],
  ['GET', `${HLX_ADMIN}/snapshot/acme/web/main`],
  ['GET', `${HLX_ADMIN}/snapshot/acme/web/main/snap1`],
  ['POST', `${HLX_ADMIN}/snapshot/acme/web/main/snap1/en/page`],
  ['GET', `${AEM_API}/acme/sites/web/status/en/page`],
  ['GET', `${HLX_ADMIN}/status/acme/web/main/en/page`],
  ['GET', `${HLX_ADMIN}/status/acme/web/main/`],
  ['GET', `${DA_ADMIN}/source/acme/web/en/page.html`],
  ['HEAD', `${DA_ADMIN}/source/acme/web/en/page.html`],
  ['PUT', `${DA_ADMIN}/source/acme/web/en/page.html`],
  ['POST', `${DA_ADMIN}/source/acme/web/en/page.html`],
  ['GET', `${DA_ADMIN}/list/acme/web/en`],
  ['GET', `${DA_ADMIN}/list/acme/web/en?continuation=abc`],
  ['GET', `${DA_CONTENT}/acme/web/en/image.png`],
  ['HEAD', `${DA_CONTENT}/acme/web/en/image.png?width=200`],
  ['GET', `${AEM_API}/acme/sites/web/source/en/page.html`],
  ['HEAD', `${AEM_API}/acme/sites/web/source/en/page.html`],
  ['POST', `${AEM_API}/acme/sites/web/snapshots/s1/`],
  ['get', `${AEM_API}/acme/sites/web/snapshots`],
];

const DENIED = [
  ['DELETE', `${DA_ADMIN}/source/acme/web/en/page.html`],
  ['DELETE', `${AEM_API}/acme/sites/web/snapshots/snap1`],
  ['DELETE', `${AEM_API}/acme/sites/web/source/en/page.html`],
  ['PUT', `${AEM_API}/acme/sites/web/source/en/page.html`],
  ['POST', `${AEM_API}/acme/sites/web/source/en/page.html`],
  ['POST', `${AEM_API}/acme/sites/web/snapshots/s1/*`],
  ['POST', `${AEM_API}/acme/sites/web/snapshots/s1/en/*`],
  ['POST', `${AEM_API}/acme/sites/web/snapshots/s1/en/%2A`],
  ['POST', `${AEM_API}/acme/sites/web/snapshots/*/en/page`],
  ['POST', `${HLX_ADMIN}/snapshot/acme/web/main/s1/*`],
  ['GET', `${DA_ADMIN}/source/acme/web/*`],
  ['POST', `${AEM_API}/acme/sites/web/snapshots/snap1?publish=true`],
  ['POST', `${AEM_API}/acme/sites/web/snapshots/snap1?review=request`],
  ['POST', `${AEM_API}/acme/sites/web/snapshots/snap1/en/page?publish=true`],
  ['POST', `${HLX_ADMIN}/snapshot/acme/web/main/snap1?publish=true`],
  ['POST', `${HLX_ADMIN}/snapshot/acme/web/main/snap1?review=approve`],
  ['POST', `${AEM_API}/acme/sites/web/snapshots/snap1`],
  ['GET', `${AEM_API}/acme/sites/web/snapshots?limit=5`],
  ['POST', `${DA_ADMIN}/copy/acme/web/en/page.html`],
  ['POST', `${DA_ADMIN}/move/acme/web/en/page.html`],
  ['GET', `${DA_ADMIN}/config/acme/web`],
  ['PUT', `${DA_ADMIN}/config/acme/web`],
  ['GET', `${AEM_API}/acme/sites/web/config/editor/da.json`],
  ['GET', `${DA_ADMIN}/logout`],
  ['GET', `${DA_ADMIN}/source/other/web/en/page.html`],
  ['GET', `${AEM_API}/other/sites/web/snapshots`],
  ['GET', `${DA_ADMIN}/source/acme/other/en/page.html`],
  ['GET', `${HLX_ADMIN}/snapshot/acme/other/main`],
  ['GET', `${DA_ADMIN}/source/acme/webx/en/page.html`],
  ['GET', `${AEM_API}/acmex/sites/web/snapshots`],
  ['GET', `${DA_CONTENT}/acme/webx/en/image.png`],
  ['GET', 'https://evil.example/acme/sites/web/snapshots'],
  ['GET', `${DA_COLLAB}/acme/web/en/page`],
  ['GET', 'http://api.aem.live/acme/sites/web/snapshots'],
  ['GET', 'https://user:pw@api.aem.live/acme/sites/web/snapshots'],
  ['GET', 'https://user@api.aem.live/acme/sites/web/snapshots'],
  ['GET', `${AEM_API}/acme%2Fother/sites/web/snapshots`],
  ['GET', `${AEM_API}/acme%2fother/sites/web/snapshots`],
  ['GET', `${DA_ADMIN}/source/acme/web/en%5Cpage.html`],
  ['GET', `${DA_ADMIN}/source/acme/web\\..\\..\\other/web/page.html`],
  ['GET', `${DA_ADMIN}/source/acme/web/../../other/web/page.html`],
  ['GET', `${DA_ADMIN}/source/acme/web/%2e%2e/%2E%2E/other/web/page.html`],
  ['GET', `${DA_ADMIN}/source/acme/web/./page.html`],
  ['GET', `${DA_ADMIN}/source/acme/web//page.html`],
  ['GET', `${DA_ADMIN}/source/acme/web`],
  ['GET', `${DA_ADMIN}/source/acme/web/page.html?x=1`],
  ['PUT', `${DA_CONTENT}/acme/web/en/image.png`],
  ['PATCH', `${DA_ADMIN}/source/acme/web/en/page.html`],
  ['GET', 'not a url'],
];

describe('extension-host', () => {
  describe('PROXY_POLICY', () => {
    it('only lists origins that are in ALLOWED_TOKEN', () => {
      const origins = Object.keys(PROXY_POLICY);
      expect(origins).to.have.length(4);
      origins.forEach((origin) => expect(ALLOWED_TOKEN).to.include(origin));
    });
  });

  describe('authorize', () => {
    it('returns the matched rule so the body check can use it', () => {
      const read = authorize({ url: `${DA_ADMIN}/source/acme/web/a.png`, method: 'GET', scope });
      const write = authorize({ url: `${DA_ADMIN}/source/acme/web/a.png`, method: 'PUT', scope });
      expect(read.rule.body ?? 'none').to.equal('none');
      expect(write.rule.body).to.equal('image-form');
    });

    ALLOWED.forEach(([method, url]) => {
      it(`allows ${method} ${url}`, () => {
        const result = authorize({ url, method, scope });
        expect(result.ok, result.reason).to.be.true;
        expect(result.url).to.be.instanceOf(URL);
      });
    });

    DENIED.forEach(([method, url]) => {
      it(`denies ${method} ${url}`, () => {
        const result = authorize({ url, method, scope });
        expect(result.ok).to.be.false;
        expect(result.reason).to.be.a('string');
      });
    });

    it('denies everything without a scope', () => {
      const url = `${AEM_API}/acme/sites/web/snapshots`;
      expect(authorize({ url, method: 'GET', scope: {} }).ok).to.be.false;
      expect(authorize({ url, method: 'GET' }).ok).to.be.false;
    });

    it('drops the fragment from the checked URL', () => {
      const result = authorize({ url: `${DA_CONTENT}/acme/web/a.png#x`, method: 'GET', scope });
      expect(result.url.href).to.equal(`${DA_CONTENT}/acme/web/a.png`);
    });
  });

  describe('checkBody', () => {
    const encode = (text) => new TextEncoder().encode(text).buffer;
    const NONE = { body: 'none' };
    const IMAGE_FORM = { body: 'image-form' };

    const formReq = async (fill, url = 'https://admin.da.live/source/acme/web/img/a.png') => {
      const form = new FormData();
      fill(form);
      const request = new Request(url, { method: 'POST', body: form });
      return {
        url,
        headers: { 'content-type': request.headers.get('content-type') },
        body: await request.arrayBuffer(),
      };
    };

    it('only uses known body rules in PROXY_POLICY', () => {
      Object.values(PROXY_POLICY).flat().forEach((rule) => {
        expect([undefined, 'none', 'image-form']).to.include(rule.body);
      });
    });

    it('none accepts a null or empty body and treats a missing rule as none', async () => {
      expect((await checkBody({ rule: NONE, req: { headers: {}, body: null } })).ok).to.be.true;
      const empty = { headers: {}, body: new ArrayBuffer(0) };
      expect((await checkBody({ rule: NONE, req: empty })).ok).to.be.true;
      const missing = await checkBody({ rule: {}, req: { headers: {}, body: encode('{}') } });
      expect(missing.ok).to.be.false;
    });

    it('none denies a non-empty body', async () => {
      const result = await checkBody({
        rule: NONE,
        req: { headers: { 'content-type': 'application/json' }, body: encode('{"publish":true}') },
      });
      expect(result.ok).to.be.false;
      expect(result.reason).to.be.a('string');
    });

    it('denies an unknown body rule', async () => {
      const result = await checkBody({ rule: { body: 'any' }, req: { headers: {}, body: null } });
      expect(result.ok).to.be.false;
    });

    it('image-form accepts one image field named data', async () => {
      const req = await formReq((form) => form.append('data', new Blob([new Uint8Array([137, 80])], { type: 'image/png' }), 'a.png'));
      expect((await checkBody({ rule: IMAGE_FORM, req })).ok).to.be.true;
    });

    it('image-form denies an image part sent to a non-image path', async () => {
      const fill = (form) => form.append('data', new Blob(['<img src="https://attacker.example/x.png">'], { type: 'image/png' }), 'a.png');
      const req = await formReq(fill, 'https://admin.da.live/source/acme/web/leak.html');
      const result = await checkBody({ rule: IMAGE_FORM, req });
      expect(result.ok).to.be.false;
      expect(result.reason).to.equal('Target path must be an image file');
    });

    const BAD_FORMS = {
      'a text/html data field': (form) => form.append('data', new Blob(['<img src="https://attacker.example/x.png">'], { type: 'text/html' }), 'a.html'),
      'a string data field': (form) => form.append('data', 'text'),
      'a field with another name': (form) => form.append('file', new Blob(['x'], { type: 'image/png' }), 'a.png'),
      'an extra field': (form) => {
        form.append('data', new Blob(['x'], { type: 'image/png' }), 'a.png');
        form.append('source', '/private.html');
      },
      'two data fields': (form) => {
        form.append('data', new Blob(['x'], { type: 'image/png' }), 'a.png');
        form.append('data', new Blob(['y'], { type: 'image/png' }), 'b.png');
      },
      'no fields': () => {},
    };

    Object.entries(BAD_FORMS).forEach(([name, fill]) => {
      it(`image-form denies ${name}`, async () => {
        const result = await checkBody({ rule: IMAGE_FORM, req: await formReq(fill) });
        expect(result.ok).to.be.false;
        expect(result.reason).to.be.a('string');
      });
    });

    it('image-form denies a body that is not multipart', async () => {
      const url = 'https://admin.da.live/source/acme/web/img/a.png';
      const json = { url, headers: { 'content-type': 'application/json' }, body: encode('{"source":"/private.html"}') };
      const png = { url, headers: { 'content-type': 'image/png' }, body: new Uint8Array([137, 80]).buffer };
      const none = { url, headers: {}, body: null };
      const broken = { url, headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: encode('garbage') };
      const results = await Promise.all([json, png, none, broken]
        .map((req) => checkBody({ rule: IMAGE_FORM, req })));
      results.forEach((result) => expect(result.ok).to.be.false);
    });
  });

  describe('parseWireRequest', () => {
    const valid = () => ({
      url: `${AEM_API}/acme/sites/web/snapshots`,
      method: 'post',
      headers: [
        ['Content-Type', 'application/json'],
        ['accept', 'application/json'],
        ['if-match', '"etag"'],
        ['if-none-match', '*'],
        ['authorization', 'Bearer stolen'],
        ['x-content-source-authorization', 'Bearer stolen'],
        ['x-custom', 'value'],
      ],
      body: new ArrayBuffer(4),
      accept: 'bytes',
    });

    it('keeps only allowlisted headers and upper-cases the method', () => {
      const { ok, req } = parseWireRequest(valid());
      expect(ok).to.be.true;
      expect(req.method).to.equal('POST');
      expect(req.headers).to.deep.equal({
        'content-type': 'application/json',
        accept: 'application/json',
        'if-match': '"etag"',
        'if-none-match': '*',
      });
      expect(req.body.byteLength).to.equal(4);
      expect(req.accept).to.equal('bytes');
    });

    const BAD = {
      'null input': null,
      'string input': 'GET /',
      'relative url': { ...valid(), url: '/acme/web' },
      'non-http url': { ...valid(), url: 'ftp://api.aem.live/x' },
      'missing url': { ...valid(), url: undefined },
      'unsupported method': { ...valid(), method: 'PATCH' },
      'missing method': { ...valid(), method: undefined },
      'headers object': { ...valid(), headers: { accept: '*/*' } },
      'header triple': { ...valid(), headers: [['a', 'b', 'c']] },
      'header number': { ...valid(), headers: [['a', 1]] },
      'header with newline': { ...valid(), headers: [['accept', 'a\r\nx-evil: 1']] },
      'string body': { ...valid(), body: 'text' },
      'typed array body': { ...valid(), body: new Uint8Array(2) },
      'GET with body': { ...valid(), method: 'GET' },
      'missing accept': { ...valid(), accept: undefined },
      'unknown accept': { ...valid(), accept: 'json' },
    };

    Object.entries(BAD).forEach(([name, raw]) => {
      it(`rejects ${name}`, () => {
        const result = parseWireRequest(raw);
        expect(result.ok).to.be.false;
        expect(result.reason).to.be.a('string');
      });
    });
  });

  describe('connectExtension handshake', () => {
    const EXT_ORIGIN = 'https://ext.example';
    const STORAGE_KEY = 'hlx6-upgrade';
    let frame;
    let win;
    let iframe;
    let handle;

    const hello = ({ nonce = 'nonce-1', origin = EXT_ORIGIN, source, v = 2 } = {}) => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: MSG.HELLO, v, nonce },
        origin,
        source: source ?? win,
      }));
    };

    const settle = () => new Promise((resolve) => { setTimeout(resolve, 20); });

    const waitForCalls = async (count) => {
      for (let i = 0; i < 100 && win.postMessage.callCount < count; i += 1) await settle();
      expect(win.postMessage.callCount).to.equal(count);
    };

    beforeEach(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}),
        '/acme/web': true,
      }));
      frame = document.createElement('iframe');
      document.body.append(frame);
      win = frame.contentWindow;
      sinon.stub(win, 'postMessage');
      iframe = { src: `${EXT_ORIGIN}/tools/add-to-snapshot.html`, contentWindow: win };
      handle = connectExtension({
        iframe,
        context: {
          view: 'edit', org: 'acme', site: 'web', repo: 'web', ref: 'main', path: '/en/page', token: 'never',
        },
      });
    });

    afterEach(() => {
      handle.close();
      frame.remove();
      sinon.restore();
    });

    it('answers a valid hello with init, the context and one port', async () => {
      hello();
      await waitForCalls(1);
      const [message, targetOrigin, transfer] = win.postMessage.firstCall.args;
      expect(targetOrigin).to.equal(EXT_ORIGIN);
      expect(message).to.deep.equal({
        type: MSG.INIT,
        v: 2,
        nonce: 'nonce-1',
        context: {
          org: 'acme', site: 'web', repo: 'web', ref: 'main', path: '/en/page', view: 'edit', hlx6: true,
        },
      });
      expect(transfer).to.have.length(1);
      expect(transfer[0]).to.be.instanceOf(MessagePort);
    });

    it('ignores a hello from the wrong source', async () => {
      hello({ source: window });
      await settle();
      expect(win.postMessage.called).to.be.false;
    });

    it('ignores a hello from the wrong origin', async () => {
      hello({ origin: 'https://evil.example' });
      await settle();
      expect(win.postMessage.called).to.be.false;
    });

    it('ignores a hello from a same-origin iframe', async () => {
      iframe.src = '/tools/add-to-snapshot.html';
      hello({ origin: window.location.origin });
      await settle();
      expect(win.postMessage.called).to.be.false;
    });

    it('ignores a hello with an opaque origin, wrong version or empty nonce', async () => {
      iframe.src = 'about:blank';
      hello({ origin: 'null' });
      iframe.src = `${EXT_ORIGIN}/tools/add-to-snapshot.html`;
      hello({ v: 1 });
      hello({ nonce: '' });
      await settle();
      expect(win.postMessage.called).to.be.false;
    });

    it('ignores the same nonce again', async () => {
      hello();
      await waitForCalls(1);
      hello();
      hello();
      await settle();
      expect(win.postMessage.callCount).to.equal(1);
    });

    it('replaces the port on a new nonce and closes in-flight requests on the old one', async () => {
      const fetchStub = sinon.stub(window, 'fetch').callsFake((url, opts) => new Promise((_, reject) => {
        opts.signal.addEventListener('abort', () => reject(opts.signal.reason));
      }));

      hello({ nonce: 'first' });
      await waitForCalls(1);
      const firstPort = win.postMessage.firstCall.args[2][0];
      const firstFetch = createDaFetch({ port: firstPort, accept: 'bytes' });
      const pending = firstFetch(`${AEM_API}/acme/sites/web/snapshots`).catch((e) => e);
      for (let i = 0; i < 50 && !fetchStub.called; i += 1) await settle();
      expect(fetchStub.calledOnce).to.be.true;

      hello({ nonce: 'second' });
      await waitForCalls(2);

      const error = await pending;
      expect(error).to.be.instanceOf(DaFetchError);
      expect(error.code).to.equal('closed');
      expect(fetchStub.firstCall.args[1].signal.aborted).to.be.true;

      const [message, , transfer] = win.postMessage.secondCall.args;
      expect(message.nonce).to.equal('second');
      expect(transfer[0]).to.not.equal(firstPort);

      fetchStub.restore();
      sinon.stub(window, 'fetch').resolves(new Response('{"ok":1}'));
      const secondFetch = createDaFetch({ port: transfer[0], accept: 'bytes' });
      const resp = await secondFetch(`${AEM_API}/acme/sites/web/snapshots`);
      expect(await resp.json()).to.deep.equal({ ok: 1 });
    });

    it('rejects pending and later calls with closed when the handle closes', async () => {
      const fetchStub = sinon.stub(window, 'fetch').callsFake((url, opts) => new Promise((_, reject) => {
        opts.signal.addEventListener('abort', () => reject(opts.signal.reason));
      }));
      hello();
      await waitForCalls(1);
      const daFetch = createDaFetch({ port: win.postMessage.firstCall.args[2][0], accept: 'bytes' });
      const inflight = daFetch(`${AEM_API}/acme/sites/web/snapshots`).catch((e) => e);
      for (let i = 0; i < 50 && !fetchStub.called; i += 1) await settle();
      const unseen = daFetch(`${AEM_API}/acme/sites/web/snapshots/s1`).catch((e) => e);

      handle.close();
      const errors = await Promise.all([inflight, unseen]);
      errors.forEach((error) => expect(error.code).to.equal('closed'));
      expect(fetchStub.firstCall.args[1].signal.aborted).to.be.true;

      const later = await daFetch(`${AEM_API}/acme/sites/web/snapshots`).catch((e) => e);
      expect(later.code).to.equal('closed');
      expect(fetchStub.calledOnce).to.be.true;
    });

    it('stops listening after close()', async () => {
      handle.close();
      handle.close();
      hello();
      await settle();
      expect(win.postMessage.called).to.be.false;
    });
  });
});
