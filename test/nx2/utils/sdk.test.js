import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { DA_ADMIN, AEM_API, HLX_ADMIN } from '../../../nx2/utils/utils.js';
import { serveFetch } from '../../../nx2/utils/extension-host.js';
import DA_SDK, { createDaFetch, DaFetchError } from '../../../nx2/utils/sdk.js';
import { canTransferStreams } from '../../../nx2/utils/sdk-wire.js';

const imsPath = '../../../nx2/utils/ims.js';
const { setMockIms, resetMockIms } = await import(imsPath);

const scope = { org: 'acme', site: 'web' };
const SNAPSHOTS = `${AEM_API}/acme/sites/web/snapshots`;
const SOURCE = `${DA_ADMIN}/source/acme/web/en/image.png`;
const TWO_MB = 2 * 1024 * 1024;

const tick = () => new Promise((resolve) => { setTimeout(resolve, 10); });

const outcome = (promise, ms = 200) => Promise.race([
  promise.then(() => 'resolved', (e) => e.code ?? e),
  new Promise((resolve) => { setTimeout(() => resolve('pending'), ms); }),
]);

const hangUntilAborted = (url, opts) => new Promise((_, reject) => {
  opts.signal.addEventListener('abort', () => reject(opts.signal.reason));
});

const setup = ({ accept = 'bytes' } = {}) => {
  const { port1, port2 } = new MessageChannel();
  const seen = [];
  port2.addEventListener('message', ({ data }) => seen.push(data));
  const server = serveFetch(port1, scope);
  const daFetch = createDaFetch({ port: port2, accept });
  return {
    daFetch, server, seen, port1, port2,
  };
};

describe('sdk2 daFetch over a MessageChannel', () => {
  let fetchStub;
  let conn;

  beforeEach(() => {
    resetMockIms();
    fetchStub = sinon.stub(window, 'fetch');
  });

  afterEach(() => {
    conn?.server.close();
    conn?.port1.close();
    conn?.port2.close();
    conn = undefined;
    sinon.restore();
  });

  it('proxies a JSON GET with host auth and safe fetch options', async () => {
    fetchStub.resolves(new Response('{"snapshots":[{"name":"s1"}]}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    conn = setup();

    const resp = await conn.daFetch(SNAPSHOTS, {
      headers: { accept: 'application/json', 'x-custom': 'dropped', authorization: 'Bearer ext' },
    });

    expect(resp).to.be.instanceOf(Response);
    expect(resp.ok).to.be.true;
    expect(resp.headers.get('content-type')).to.equal('application/json');
    expect(await resp.json()).to.deep.equal({ snapshots: [{ name: 's1' }] });

    const [url, opts] = fetchStub.firstCall.args;
    expect(url).to.equal(SNAPSHOTS);
    expect(opts.method).to.equal('GET');
    expect(opts.credentials).to.equal('omit');
    expect(opts.redirect).to.equal('error');
    expect(opts.cache).to.equal('no-store');
    expect(opts.headers).to.deep.equal({
      accept: 'application/json',
      Authorization: 'Bearer test-token',
      'x-content-source-authorization': 'Bearer test-token',
    });
  });

  it('resolves a 404 instead of rejecting', async () => {
    fetchStub.resolves(new Response('missing', { status: 404, statusText: 'Not Found' }));
    conn = setup();

    const resp = await conn.daFetch(`${SNAPSHOTS}/nope`);
    expect(resp.ok).to.be.false;
    expect(resp.status).to.equal(404);
    expect(resp.statusText).to.equal('Not Found');
    expect(await resp.text()).to.equal('missing');
  });

  it('returns a null body for HEAD and 204', async () => {
    fetchStub.callsFake(async (url, opts) => new Response(null, { status: opts.method === 'HEAD' ? 200 : 204 }));
    conn = setup({ accept: 'stream' });

    const head = await conn.daFetch(SOURCE, { method: 'HEAD' });
    expect(head.status).to.equal(200);
    expect(head.body).to.equal(null);
    const empty = await conn.daFetch(`${SNAPSHOTS}/s1/en/page`, { method: 'POST' });
    expect(empty.status).to.equal(204);
    expect(empty.body).to.equal(null);
  });

  it('uploads FormData as multipart bytes with its content-type', async () => {
    fetchStub.resolves(new Response('{}', { status: 201 }));
    conn = setup();

    const form = new FormData();
    form.append('data', new Blob(['<p>hello</p>'], { type: 'image/svg+xml' }), 'page.html');
    const resp = await conn.daFetch(SOURCE, { method: 'PUT', body: form });
    expect(resp.status).to.equal(201);

    const [, opts] = fetchStub.firstCall.args;
    expect(opts.method).to.equal('PUT');
    expect(opts.headers['content-type']).to.match(/^multipart\/form-data; boundary=/);
    expect(opts.body).to.be.instanceOf(ArrayBuffer);
    const text = new TextDecoder().decode(opts.body);
    const boundary = opts.headers['content-type'].split('boundary=')[1];
    expect(text).to.include(`--${boundary}`);
    expect(text).to.include('filename="page.html"');
    expect(text).to.include('<p>hello</p>');
  });

  ['stream', 'bytes'].forEach((accept) => {
    it(`round trips 2 MB of binary in ${accept} mode`, async () => {
      fetchStub.callsFake(async (url, opts) => {
        const sent = await new Response(opts.body, { headers: opts.headers }).formData();
        return new Response(sent.get('data'), {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        });
      });
      conn = setup({ accept });

      const bytes = new Uint8Array(TWO_MB).map((_, i) => i % 251);
      const body = new FormData();
      body.append('data', new Blob([bytes], { type: 'image/png' }), 'big.png');
      const resp = await conn.daFetch(SOURCE, { method: 'PUT', body });

      expect(bytes.byteLength, 'caller buffer is not detached').to.equal(TWO_MB);
      expect(fetchStub.firstCall.args[1].body.byteLength).to.be.above(TWO_MB);

      const echoed = new Uint8Array(await resp.arrayBuffer());
      expect(echoed.byteLength).to.equal(TWO_MB);
      expect(echoed.every((value, i) => value === i % 251)).to.be.true;

      const wireBody = conn.seen.find(({ type }) => type === 'response').res.body;
      if (accept === 'stream' && canTransferStreams()) {
        expect(wireBody).to.be.instanceOf(ReadableStream);
      } else {
        expect(wireBody).to.be.instanceOf(ArrayBuffer);
      }
    });
  });

  it('rejects a denied request with DaFetchError denied and never fetches', async () => {
    conn = setup();

    const error = await conn.daFetch(SOURCE, { method: 'DELETE' }).catch((e) => e);
    expect(error).to.be.instanceOf(DaFetchError);
    expect(error.code).to.equal('denied');

    const other = await conn.daFetch('https://evil.example/x').catch((e) => e);
    expect(other.code).to.equal('denied');
    expect(fetchStub.called).to.be.false;
  });

  describe('body policy regressions', () => {
    const expectDenied = async (pending) => {
      const error = await pending.catch((e) => e);
      expect(error).to.be.instanceOf(DaFetchError);
      expect(error.code).to.equal('denied');
      expect(fetchStub.called).to.be.false;
    };
    const json = (data) => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

    it('denies an AEM source POST with HTML that the backend would intern with the token', async () => {
      conn = setup();
      await expectDenied(conn.daFetch(`${AEM_API}/acme/sites/web/source/token-leak.html`, {
        method: 'POST',
        headers: { 'content-type': 'text/html' },
        body: '<body><main><img src="https://attacker.example/unique.png"></main></body>',
      }));
    });

    it('denies an AEM source PUT that copies another resource', async () => {
      conn = setup();
      await expectDenied(conn.daFetch(`${AEM_API}/acme/sites/web/source/page.html`, {
        method: 'PUT',
        ...json({ source: '/private.html' }),
      }));
    });

    [{ publish: true }, { review: 'approve' }].forEach((data) => {
      it(`denies a snapshot POST to /* with ${JSON.stringify(data)}`, async () => {
        conn = setup();
        await expectDenied(conn.daFetch(`${AEM_API}/acme/sites/web/snapshots/s1/*`, { method: 'POST', ...json(data) }));
        await expectDenied(conn.daFetch(`${HLX_ADMIN}/snapshot/acme/web/main/s1/*`, { method: 'POST', ...json(data) }));
      });

      it(`denies a snapshot add-path POST with ${JSON.stringify(data)}`, async () => {
        conn = setup();
        await expectDenied(conn.daFetch(`${SNAPSHOTS}/s1/en/page`, { method: 'POST', ...json(data) }));
      });
    });

    it('denies a bulk snapshot remove carried in the body', async () => {
      conn = setup();
      await expectDenied(conn.daFetch(`${SNAPSHOTS}/s1/`, {
        method: 'POST',
        ...json({ paths: ['/en/page', '/en/other'], delete: true }),
      }));
    });

    it('denies a snapshot POST to /* with an empty body', async () => {
      conn = setup();
      await expectDenied(conn.daFetch(`${SNAPSHOTS}/s1/*`, { method: 'POST' }));
    });

    it('denies a DA source write that is not one image field', async () => {
      conn = setup();
      const form = new FormData();
      form.append('data', new Blob(['<p>x</p>'], { type: 'text/html' }), 'page.html');
      await expectDenied(conn.daFetch(SOURCE, { method: 'PUT', body: form }));
      await expectDenied(conn.daFetch(SOURCE, { method: 'POST', ...json({ source: '/private.html' }) }));
    });

    it('proxies a snapshot add with an empty body', async () => {
      fetchStub.resolves(new Response('{}', { status: 200 }));
      conn = setup();
      const resp = await conn.daFetch(`${SNAPSHOTS}/s1/en/page`, { method: 'POST' });
      expect(resp.status).to.equal(200);
      const [url, opts] = fetchStub.firstCall.args;
      expect(url).to.equal(`${SNAPSHOTS}/s1/en/page`);
      expect(opts.method).to.equal('POST');
      expect(opts.body.byteLength).to.equal(0);
    });
  });

  it('rejects an unsupported method with bad-request', async () => {
    conn = setup();
    const error = await conn.daFetch(SOURCE, { method: 'PATCH', body: 'x' }).catch((e) => e);
    expect(error.code).to.equal('bad-request');
    expect(fetchStub.called).to.be.false;
  });

  it('rejects with unauthenticated when there is no token', async () => {
    setMockIms({ token: null });
    conn = setup();
    const error = await conn.daFetch(SNAPSHOTS).catch((e) => e);
    expect(error).to.be.instanceOf(DaFetchError);
    expect(error.code).to.equal('unauthenticated');
    expect(fetchStub.called).to.be.false;
  });

  it('rejects with network when the host fetch throws', async () => {
    fetchStub.rejects(new TypeError('Failed to fetch'));
    conn = setup();
    const error = await conn.daFetch(SNAPSHOTS).catch((e) => e);
    expect(error.code).to.equal('network');
    expect(error.message).to.equal('Failed to fetch');
  });

  it('aborts before the response with signal.reason and aborts the host fetch', async () => {
    fetchStub.callsFake(hangUntilAborted);
    conn = setup();

    const controller = new AbortController();
    const pending = conn.daFetch(SNAPSHOTS, { signal: controller.signal });
    for (let i = 0; i < 50 && !fetchStub.called; i += 1) await tick();

    const reason = new Error('user cancelled');
    controller.abort(reason);
    const error = await pending.catch((e) => e);
    expect(error).to.equal(reason);

    await tick();
    expect(fetchStub.firstCall.args[1].signal.aborted).to.be.true;
  });

  describe('abort after the response headers', () => {
    const openStream = () => {
      const host = {};
      fetchStub.callsFake(async (url, opts) => {
        host.signal = opts.signal;
        return new Response(new ReadableStream({
          start(controller) {
            host.controller = controller;
            controller.enqueue(new Uint8Array([1]));
          },
        }));
      });
      return host;
    };

    it('errors the body and aborts the host fetch in stream mode', async () => {
      const host = openStream();
      conn = setup({ accept: 'stream' });
      const controller = new AbortController();
      const resp = await conn.daFetch(SNAPSHOTS, { signal: controller.signal });
      const reader = resp.body.getReader();
      expect((await reader.read()).value).to.deep.equal(new Uint8Array([1]));

      const reason = new Error('user cancelled');
      controller.abort(reason);
      const error = await reader.read().catch((e) => e);
      expect(error).to.equal(reason);

      for (let i = 0; i < 50 && !host.signal.aborted; i += 1) await tick();
      expect(host.signal.aborted).to.be.true;
    });

    ['stream', 'bytes'].forEach((accept) => {
      // Chrome reports any stream error from Response.text() as TypeError, so read the stream.
      it(`errors an unread body with signal.reason in ${accept} mode`, async () => {
        fetchStub.callsFake(async () => new Response('hello'));
        conn = setup({ accept });
        const controller = new AbortController();
        const resp = await conn.daFetch(SNAPSHOTS, { signal: controller.signal });

        const reason = new Error('user cancelled');
        controller.abort(reason);
        const error = await resp.body.getReader().read().catch((e) => e);
        expect(error).to.equal(reason);
      });

      it(`does nothing on abort after the body ended in ${accept} mode`, async () => {
        fetchStub.callsFake(async () => new Response('hello'));
        conn = setup({ accept });
        const controller = new AbortController();
        const resp = await conn.daFetch(SNAPSHOTS, { signal: controller.signal });
        expect(await resp.text()).to.equal('hello');
        await tick();

        const post = sinon.spy(conn.port2, 'postMessage');
        controller.abort();
        expect(post.called).to.be.false;
      });
    });
  });

  it('rejects at once when the signal is already aborted', async () => {
    conn = setup();
    const error = await conn.daFetch(SNAPSHOTS, { signal: AbortSignal.abort() }).catch((e) => e);
    expect(error.name).to.equal('AbortError');
    expect(fetchStub.called).to.be.false;
  });

  it('close() aborts in-flight requests and rejects them with closed', async () => {
    fetchStub.callsFake(hangUntilAborted);
    conn = setup();

    const first = conn.daFetch(SNAPSHOTS);
    const second = conn.daFetch(`${SNAPSHOTS}/s1`);
    for (let i = 0; i < 50 && fetchStub.callCount < 2; i += 1) await tick();
    expect(fetchStub.callCount).to.equal(2);

    conn.server.close();
    conn.server.close();
    const errors = await Promise.all([first, second].map((p) => p.catch((e) => e)));
    errors.forEach((error) => {
      expect(error).to.be.instanceOf(DaFetchError);
      expect(error.code).to.equal('closed');
    });
    fetchStub.getCalls().forEach((call) => expect(call.args[1].signal.aborted).to.be.true);
  });

  it('rejects a request the host never saw when the host closes', async () => {
    conn = setup();
    const racing = conn.daFetch(SNAPSHOTS);
    conn.server.close();
    conn.port1.close();
    expect(await outcome(racing)).to.equal('closed');
  });

  it('rejects every call after the host closed', async () => {
    fetchStub.resolves(new Response('ok'));
    conn = setup();
    await conn.daFetch(SNAPSHOTS);
    conn.server.close();
    conn.port1.close();
    await tick();
    const later = await Promise.all([
      outcome(conn.daFetch(SNAPSHOTS)),
      outcome(conn.daFetch(SOURCE, { method: 'HEAD' })),
    ]);
    expect(later).to.deep.equal(['closed', 'closed']);
    expect(fetchStub.calledOnce).to.be.true;
  });

  it('sends close on the port when the host closes', async () => {
    conn = setup();
    conn.server.close();
    await tick();
    expect(conn.seen).to.deep.include({ type: 'close' });
  });

  it('ignores messages without its type on a shared port', async () => {
    fetchStub.resolves(new Response('ok'));
    conn = setup();
    conn.port2.postMessage({ action: 'sendText', details: 'legacy' });
    conn.port2.postMessage({ type: 'fetch', id: -1, req: {} });
    const resp = await conn.daFetch(SNAPSHOTS);
    expect(await resp.text()).to.equal('ok');
    expect(fetchStub.calledOnce).to.be.true;
  });
});

describe('DA_SDK', () => {
  it('rejects with unsupported when the page is not framed', async function notFramed() {
    if (window.parent !== window) this.skip();
    const error = await DA_SDK.catch((e) => e);
    expect(error).to.be.instanceOf(DaFetchError);
    expect(error.code).to.equal('unsupported');
  });
});
