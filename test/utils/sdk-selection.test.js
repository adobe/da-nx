import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import * as SDK from '../../nx/utils/sdk.js';

describe('SDK sendHTML replacement', () => {
  let port;
  let actions;
  beforeEach(() => {
    port = new EventTarget();
    port.postMessage = sinon.spy();
    port.start = sinon.spy();
    actions = SDK.createHostActions({ port, capabilities: { sendHTMLReplace: 1 } });
  });
  afterEach(() => sinon.restore());
  const reply = (result, index = 0) => {
    port.dispatchEvent(new MessageEvent('message', {
      data: {
        action: 'sdkResponse', requestId: port.postMessage.getCall(index).args[0].requestId, result,
      },
    }));
  };
  it('preserves fire-and-forget insertion including replace false', () => {
    expect(actions.sendHTML('<p>Insert</p>')).to.equal(undefined);
    expect(actions.sendHTML('<p>Insert</p>', { replace: false })).to.equal(undefined);
    expect(port.postMessage.firstCall.args[0]).to.deep.equal({ action: 'sendHTML', details: '<p>Insert</p>' });
    expect(port.start.called).to.equal(false);
  });
  it('refuses unsupported replacement without posting an insertion', async () => {
    actions = SDK.createHostActions({ port });
    expect(await actions.sendHTML('<p>Replace</p>', { replace: true }))
      .to.deep.equal({ ok: false, error: 'unsupported' });
    expect(port.postMessage.called).to.equal(false);
  });
  it('sends the replacement and its precondition and awaits an acknowledged snapshot', async () => {
    const expected = { html: '<main>Old</main>', blockIndex: 0 };
    const pending = actions.sendHTML('<p>Replace</p>', { replace: true, expected });
    expect(port.postMessage.firstCall.args[0].details)
      .to.deep.equal({ html: '<p>Replace</p>', replace: true, expected });
    const result = { ok: true, html: '<main>New</main>', selection: { blockIndex: 0 } };
    reply(result);
    expect(await pending).to.deep.equal(result);
  });
  it('correlates concurrent replacements and propagates host failures', async () => {
    const first = actions.sendHTML('<p>First</p>', { replace: true });
    const second = actions.sendHTML('<p>Second</p>', { replace: true });
    reply({ ok: false, error: 'STALE_LIVE' }, 1);
    reply({ ok: true, html: '<main>First</main>', selection: { blockIndex: null } });
    expect((await first).ok).to.equal(true);
    expect(await second).to.deep.equal({ ok: false, error: 'STALE_LIVE' });
  });
  it('rejects malformed successful snapshots', async () => {
    const pending = actions.sendHTML('<p>New</p>', { replace: true });
    reply({ ok: true });
    expect(await pending).to.deep.equal({ ok: false, error: 'invalid-response' });
  });
  it('preserves successful replacement acknowledgements when host serialization fails', async () => {
    const pending = actions.sendHTML('<p>New</p>', { replace: true });
    const result = { ok: true, html: null, selection: { blockIndex: 0 }, editable: true };
    reply(result);
    expect(await pending).to.deep.equal(result);
  });
  it('times out without retrying a replacement', async () => {
    const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pending = actions.sendHTML('<p>New</p>', { replace: true });
      clock.tick(15000);
      expect(await pending).to.deep.equal({ ok: false, error: 'timeout' });
      expect(port.postMessage.calledOnce).to.equal(true);
      expect(clock.countTimers()).to.equal(0);
    } finally { clock.restore(); }
  });
  it('reports disconnected ports', async () => {
    port.postMessage = () => { throw new Error('closed'); };
    expect(await actions.sendHTML('<p>New</p>', { replace: true }))
      .to.deep.equal({ ok: false, error: 'disconnected' });
  });
});

describe('SDK getSelection', () => {
  let port;
  let actions;
  let clock;
  let timers;
  let clearTimers;

  beforeEach(() => {
    port = new EventTarget();
    port.postMessage = sinon.spy();
    port.start = sinon.spy();
    sinon.spy(port, 'addEventListener');
    sinon.spy(port, 'removeEventListener');
    actions = SDK.createHostActions({ port });
    timers = sinon.spy(window, 'setTimeout');
    clearTimers = sinon.spy(window, 'clearTimeout');
  });

  afterEach(() => {
    clock?.restore();
    clock = undefined;
    sinon.restore();
  });

  function reply(result, index = 0) {
    const { requestId } = port.postMessage.getCall(index).args[0];
    port.dispatchEvent(new MessageEvent('message', {
      data: { action: 'sdkResponse', requestId, result },
    }));
  }

  function expectCleanedUp(count = 1) {
    expect(port.removeEventListener.callCount).to.equal(count);
    port.addEventListener.getCalls().forEach(({ args }, index) => {
      expect(port.removeEventListener.getCall(index).args).to.deep.equal(args);
    });
    timers.returnValues.forEach((timer) => expect(clearTimers.calledWith(timer)).to.equal(true));
  }

  async function expectRejection(promise, reason) {
    let caught;
    try {
      await promise;
    } catch (err) {
      caught = err;
    }
    expect(caught).to.equal(reason);
  }

  it('requests the selection on the port and resolves with the host HTML', async () => {
    const pending = actions.getSelection();
    const message = port.postMessage.firstCall.args[0];
    expect(message).to.have.all.keys('action', 'requestId');
    expect(message.action).to.equal('getSelection');
    expect(message.requestId).to.be.a('string').and.not.empty;
    expect(port.start.calledOnce).to.equal(true);
    reply({ ok: true, html: '<p>Selected</p>' });
    expect(await pending).to.equal('<p>Selected</p>');
    expectCleanedUp();
  });

  ['No selection found', 'No editor view'].forEach((error) => {
    it(`rejects with the host message "${error}" and cleans up`, async () => {
      const pending = actions.getSelection();
      reply({ ok: false, error });
      await expectRejection(pending, error);
      expectCleanedUp();
    });
  });

  it('is not settled by unrelated window or port messages', async () => {
    const settled = sinon.spy();
    const pending = actions.getSelection().then((html) => {
      settled(html);
      return html;
    });
    const { requestId } = port.postMessage.firstCall.args[0];
    window.dispatchEvent(new MessageEvent('message', { data: { action: 'agentChange', detail: {} } }));
    window.dispatchEvent(new MessageEvent('message', { data: { token: 'refreshed' } }));
    [
      null,
      { action: 'sdkResponse', requestId: 'unrelated', result: { ok: true, html: '<p>Other</p>' } },
      { action: 'sendSelection', requestId, details: '<p>Legacy</p>' },
      { action: 'error', details: 'No selection found' },
    ].forEach((data) => port.dispatchEvent(new MessageEvent('message', { data })));
    await Promise.resolve();
    expect(settled.called).to.equal(false);
    reply({ ok: true, html: '<p>Selected</p>' });
    expect(await pending).to.equal('<p>Selected</p>');
    expectCleanedUp();
  });

  it('correlates concurrent selection requests', async () => {
    const first = actions.getSelection();
    const second = actions.getSelection();
    expect(port.postMessage.firstCall.args[0].requestId)
      .not.to.equal(port.postMessage.secondCall.args[0].requestId);
    reply({ ok: true, html: '<p>Second</p>' }, 1);
    reply({ ok: true, html: '<p>First</p>' }, 0);
    expect(await first).to.equal('<p>First</p>');
    expect(await second).to.equal('<p>Second</p>');
    expect(port.removeEventListener.callCount).to.equal(2);
    timers.returnValues.forEach((timer) => expect(clearTimers.calledWith(timer)).to.equal(true));
  });

  it('rejects with timeout after 15 seconds without a reply and cleans up', async () => {
    timers.restore();
    clearTimers.restore();
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const settled = sinon.spy();
    const pending = actions.getSelection().catch((err) => {
      settled(err);
      return err;
    });
    clock.tick(14999);
    await Promise.resolve();
    expect(settled.called).to.equal(false);
    clock.tick(1);
    expect(clock.countTimers()).to.equal(0);
    clock.restore();
    clock = undefined;
    expect(await pending).to.equal('timeout');
    expect(port.removeEventListener.callCount).to.equal(1);
    reply({ ok: true, html: '<p>Late</p>' });
    expect(settled.callCount).to.equal(1);
  });

  [
    undefined,
    {},
    { ok: 'true', html: '<p>x</p>' },
    { ok: true },
    { ok: true, html: 5 },
    { ok: false },
  ].forEach((result) => {
    it(`rejects malformed reply ${JSON.stringify(result)} as invalid-response`, async () => {
      const pending = actions.getSelection();
      reply(result);
      await expectRejection(pending, 'invalid-response');
      expectCleanedUp();
    });
  });

  it('rejects as disconnected when the port is closed', async () => {
    port.postMessage = () => { throw new Error('closed'); };
    await expectRejection(actions.getSelection(), 'disconnected');
    expectCleanedUp();
  });

  it('works through the SDK handshake over a real MessageChannel', async () => {
    const channel = new MessageChannel();
    try {
      channel.port1.onmessage = ({ data }) => {
        if (data.action !== 'getSelection') return;
        // A message on window must not end the pending request.
        window.dispatchEvent(new MessageEvent('message', { data: { action: 'agentChange', detail: {} } }));
        channel.port1.postMessage({
          action: 'sdkResponse', requestId: data.requestId, result: { ok: true, html: '<p>Real</p>' },
        });
      };
      window.dispatchEvent(new MessageEvent('message', {
        data: { ready: true, context: 'selection' }, ports: [channel.port2],
      }));
      const sdk = await SDK.default;
      expect(await sdk.actions.getSelection()).to.equal('<p>Real</p>');
    } finally {
      channel.port1.close();
      channel.port2.close();
    }
  });
});

describe('SDK subscribeLiveDocument', () => {
  let port;
  let actions;

  beforeEach(() => {
    port = new EventTarget();
    port.postMessage = sinon.spy();
    port.start = sinon.spy();
    sinon.spy(port, 'addEventListener');
    sinon.spy(port, 'removeEventListener');
    actions = SDK.createHostActions({ port });
  });

  afterEach(() => sinon.restore());

  function emit(data) {
    port.dispatchEvent(new MessageEvent('message', { data }));
  }

  it('retains document permissions during selection-only notifications', () => {
    const received = sinon.spy();
    const unsubscribe = actions.subscribeLiveDocument(received);
    emit({ action: 'liveDocument', html: '<main>Read only</main>', selection: { blockIndex: 0 }, editable: false });
    emit({ action: 'liveSelection', selection: { blockIndex: null } });
    expect(received.secondCall.args[0]).to.deep.equal({
      html: '<main>Read only</main>', selection: { blockIndex: null }, editable: false,
    });
    unsubscribe();
  });

  it('assembles full snapshots and selection-only changes, ignoring unrelated messages', () => {
    const received = sinon.spy();
    const unsubscribe = actions.subscribeLiveDocument(received);
    expect(unsubscribe).to.be.a('function');
    expect(port.postMessage.firstCall.args[0]).to.deep.equal({ action: 'subscribeLiveDocument' });
    expect(port.start.calledOnce).to.equal(true);

    emit({ action: 'liveSelection', selection: { blockIndex: 0 } });
    emit({ action: 'sdkResponse', result: { ok: true, html: '<main>Other</main>' } });
    emit({ action: 'liveDocument', html: '<main>Invalid</main>', selection: { blockIndex: -1 } });
    expect(received.called).to.equal(false);

    emit({ action: 'liveDocument', html: '<main><p>First</p></main>', selection: { blockIndex: 0 } });
    emit({ action: 'liveSelection', selection: { blockIndex: null } });
    emit({ action: 'liveDocument', html: '<main><p>Second</p></main>', selection: { blockIndex: 1 } });
    expect(received.args).to.deep.equal([
      [{ html: '<main><p>First</p></main>', selection: { blockIndex: 0 } }],
      [{ html: '<main><p>First</p></main>', selection: { blockIndex: null } }],
      [{ html: '<main><p>Second</p></main>', selection: { blockIndex: 1 } }],
    ]);
    unsubscribe();
  });

  it('shares one host subscription and gives later subscribers the current state', () => {
    const first = sinon.spy();
    const second = sinon.spy();
    const unsubscribeFirst = actions.subscribeLiveDocument(first);
    emit({ action: 'liveDocument', html: '<main><p>A</p></main>', selection: { blockIndex: 0 } });
    const unsubscribeSecond = actions.subscribeLiveDocument(second);
    expect(second.firstCall.args[0]).to.deep.equal({
      html: '<main><p>A</p></main>', selection: { blockIndex: 0 },
    });
    expect(port.postMessage.calledOnce).to.equal(true);
    expect(port.addEventListener.calledOnce).to.equal(true);
    unsubscribeFirst();
    expect(port.removeEventListener.called).to.equal(false);
    emit({ action: 'liveSelection', selection: { blockIndex: null } });
    expect(first.calledOnce).to.equal(true);
    expect(second.secondCall.args[0]).to.deep.equal({
      html: '<main><p>A</p></main>', selection: { blockIndex: null },
    });
    unsubscribeSecond();
    unsubscribeSecond();
    expect(port.postMessage.args.map(([message]) => message.action)).to.deep.equal([
      'subscribeLiveDocument', 'unsubscribeLiveDocument',
    ]);
    expect(port.removeEventListener.calledOnceWithExactly(...port.addEventListener.firstCall.args))
      .to.equal(true);
  });

  it('does not replay a prior subscription after the last unsubscribe', () => {
    const first = sinon.spy();
    const unsubscribeFirst = actions.subscribeLiveDocument(first);
    emit({ action: 'liveDocument', html: '<main><p>Old</p></main>', selection: { blockIndex: 0 } });
    unsubscribeFirst();
    emit({ action: 'liveDocument', html: '<main><p>After unsubscribe</p></main>', selection: { blockIndex: 1 } });
    const next = sinon.spy();
    const unsubscribeNext = actions.subscribeLiveDocument(next);
    expect(next.called).to.equal(false);
    emit({ action: 'liveSelection', selection: { blockIndex: 1 } });
    expect(next.called).to.equal(false);
    emit({ action: 'liveDocument', html: '<main><p>Fresh</p></main>', selection: { blockIndex: null } });
    expect(next.calledOnceWithExactly({
      html: '<main><p>Fresh</p></main>', selection: { blockIndex: null },
    })).to.equal(true);
    unsubscribeNext();
    expect(port.postMessage.args.map(([message]) => message.action)).to.deep.equal([
      'subscribeLiveDocument', 'unsubscribeLiveDocument',
      'subscribeLiveDocument', 'unsubscribeLiveDocument',
    ]);
  });

  it('rolls back a subscriber whose cached replay throws without leaking the host subscription', () => {
    const received = sinon.spy();
    const unsubscribe = actions.subscribeLiveDocument(received);
    emit({ action: 'liveDocument', html: '<main>Cached</main>', selection: { blockIndex: 0 } });
    const error = new Error('Replay failed');
    const failing = sinon.stub().throws(error);
    expect(() => actions.subscribeLiveDocument(failing)).to.throw(error);
    emit({ action: 'liveSelection', selection: { blockIndex: null } });
    expect(failing.calledOnce).to.equal(true);
    expect(received.callCount).to.equal(2);
    unsubscribe();
    expect(port.removeEventListener.calledOnce).to.equal(true);
    expect(port.postMessage.lastCall.args[0]).to.deep.equal({ action: 'unsubscribeLiveDocument' });
    const fresh = sinon.spy();
    const unsubscribeFresh = actions.subscribeLiveDocument(fresh);
    expect(fresh.called).to.equal(false);
    unsubscribeFresh();
  });

  it('cleans up the host when the last existing subscriber unsubscribes during a failing replay', () => {
    const unsubscribe = actions.subscribeLiveDocument(sinon.spy());
    emit({ action: 'liveDocument', html: '<main>Cached</main>', selection: { blockIndex: 0 } });
    const error = new Error('Replay failed');
    expect(() => actions.subscribeLiveDocument(() => {
      unsubscribe();
      throw error;
    })).to.throw(error);
    expect(port.removeEventListener.calledOnce).to.equal(true);
    expect(port.postMessage.args.map(([message]) => message.action)).to.deep.equal([
      'subscribeLiveDocument', 'unsubscribeLiveDocument',
    ]);
  });

  it('logs notification errors without blocking other subscribers or future updates', () => {
    const error = new Error('Subscriber failed');
    const failing = sinon.stub().throws(error);
    const received = sinon.spy();
    const log = sinon.stub(console, 'error');
    const unsubscribeFailing = actions.subscribeLiveDocument(failing);
    const unsubscribeReceived = actions.subscribeLiveDocument(received);
    emit({ action: 'liveDocument', html: '<main>First</main>', selection: { blockIndex: 0 } });
    emit({ action: 'liveSelection', selection: { blockIndex: null } });
    emit({ action: 'liveDocument', html: '<main>Second</main>', selection: { blockIndex: 1 } });
    expect(failing.callCount).to.equal(3);
    expect(log.callCount).to.equal(3);
    expect(log.alwaysCalledWithExactly('Live document subscriber failed:', error)).to.equal(true);
    expect(received.args).to.deep.equal([
      [{ html: '<main>First</main>', selection: { blockIndex: 0 } }],
      [{ html: '<main>First</main>', selection: { blockIndex: null } }],
      [{ html: '<main>Second</main>', selection: { blockIndex: 1 } }],
    ]);
    unsubscribeFailing();
    unsubscribeReceived();
    expect(port.postMessage.lastCall.args[0]).to.deep.equal({ action: 'unsubscribeLiveDocument' });
  });

  it('does not intercept a concurrent getSelection response', async () => {
    const received = sinon.spy();
    const unsubscribe = actions.subscribeLiveDocument(received);
    const pending = actions.getSelection();
    const { requestId } = port.postMessage.secondCall.args[0];
    emit({ action: 'liveDocument', html: '<main><p>Live</p></main>', selection: { blockIndex: 0 } });
    emit({ action: 'sdkResponse', requestId, result: { ok: true, html: '<p>Selected</p>' } });
    expect(await pending).to.equal('<p>Selected</p>');
    expect(received.calledOnce).to.equal(true);
    unsubscribe();
  });
});
