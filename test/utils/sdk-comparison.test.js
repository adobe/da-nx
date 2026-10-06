import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import * as SDK from '../../nx/utils/sdk.js';

describe('workspace SDK actions', () => {
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

  ['document', 'preview'].forEach((candidate) => {
    it(`posts ${candidate} comparison synchronously without an acknowledgement`, () => {
      expect(actions.openComparison({ candidate, baseline: 'live' })).to.equal(undefined);
      expect(port.postMessage.firstCall.args[0]).to.deep.equal({
        action: 'openComparison', details: { candidate, baseline: 'live' },
      });
      expect(port.addEventListener.called).to.equal(false);
      expect(port.start.called).to.equal(false);
      expect(timers.called).to.equal(false);
    });
  });

  it('closes comparison synchronously without listeners or timers', () => {
    expect(actions.closeComparison()).to.equal(undefined);
    expect(port.postMessage.firstCall.args[0]).to.deep.equal({ action: 'closeComparison' });
    expect(port.addEventListener.called).to.equal(false);
    expect(port.start.called).to.equal(false);
    expect(timers.called).to.equal(false);
  });

  it('sends only the supported comparison details', () => {
    actions.openComparison({ candidate: 'document', baseline: 'live', html: '<p>ignored</p>', url: 'https://example.com' });
    expect(port.postMessage.firstCall.args[0]).to.deep.equal({
      action: 'openComparison', details: { candidate: 'document', baseline: 'live' },
    });
  });

  it('throws for invalid comparison options before sending', () => {
    [
      undefined,
      null,
      {},
      { candidate: 'https://example.com', baseline: 'live' },
      { candidate: 'document', baseline: 'preview' },
      { candidate: 'preview' },
    ].forEach((options) => {
      expect(() => actions.openComparison(options)).to.throw(TypeError, 'invalid-comparison');
    });
    expect(port.postMessage.called).to.equal(false);
    expect(port.addEventListener.called).to.equal(false);
    expect(timers.called).to.equal(false);
  });

  it('propagates comparison postMessage errors synchronously', () => {
    port.postMessage = () => { throw new Error('closed'); };
    expect(() => actions.openComparison({ candidate: 'document', baseline: 'live' })).to.throw('closed');
    expect(() => actions.closeComparison()).to.throw('closed');
    expect(port.addEventListener.called).to.equal(false);
    expect(timers.called).to.equal(false);
  });

  it('keeps save awaitable until the matching acknowledgement', async () => {
    const settled = sinon.spy();
    const pending = actions.saveDocument().then((result) => {
      settled(result);
      return result;
    });
    const message = port.postMessage.firstCall.args[0];
    expect(message).to.have.all.keys('action', 'requestId');
    expect(message.action).to.equal('saveDocument');
    expect(message.requestId).to.be.a('string').and.not.empty;
    expect(port.start.calledOnce).to.equal(true);
    await Promise.resolve();
    expect(settled.called).to.equal(false);
    reply({ ok: true });
    expect(await pending).to.deep.equal({ ok: true });
    expectCleanedUp();
  });

  it('correlates concurrent saves, ignoring unrelated messages and out-of-order replies', async () => {
    const firstSettled = sinon.spy();
    const first = actions.saveDocument().then((result) => {
      firstSettled(result);
      return result;
    });
    const second = actions.saveDocument();
    const firstId = port.postMessage.firstCall.args[0].requestId;
    expect(firstId).not.to.equal(port.postMessage.secondCall.args[0].requestId);
    [
      null,
      { action: 'sdkResponse', requestId: 'unrelated', result: { ok: true } },
      { action: 'other', requestId: firstId, result: { ok: true } },
    ].forEach((data) => port.dispatchEvent(new MessageEvent('message', { data })));
    reply({ ok: false, error: 'save-failed' }, 1);
    expect(await second).to.deep.equal({ ok: false, error: 'save-failed' });
    expect(firstSettled.called).to.equal(false);
    expect(clearTimers.calledWith(timers.firstCall.returnValue)).to.equal(false);
    reply({ ok: true });
    expect(await first).to.deep.equal({ ok: true });
    expect(port.removeEventListener.callCount).to.equal(2);
    expect(port.removeEventListener.firstCall.args)
      .to.deep.equal(port.addEventListener.secondCall.args);
    expect(port.removeEventListener.secondCall.args)
      .to.deep.equal(port.addEventListener.firstCall.args);
    timers.returnValues.forEach((timer) => expect(clearTimers.calledWith(timer)).to.equal(true));
  });

  it('times out a save after 15 seconds without retrying and cleans up', async () => {
    timers.restore();
    clearTimers.restore();
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const settled = sinon.spy();
    const pending = actions.saveDocument().then((result) => {
      settled(result);
      return result;
    });
    clock.tick(14999);
    await Promise.resolve();
    expect(settled.called).to.equal(false);
    clock.tick(1);
    expect(clock.countTimers()).to.equal(0);
    clock.restore();
    clock = undefined;
    expect(await pending).to.deep.equal({ ok: false, error: 'timeout' });
    expect(port.postMessage.callCount).to.equal(1);
    expectCleanedUp();
    reply({ ok: true });
    expect(settled.callCount).to.equal(1);
  });

  [undefined, null, 'bad', {}, { ok: 'true' }].forEach((result) => {
    it(`settles malformed save reply ${JSON.stringify(result)} as an error and cleans up`, async () => {
      const pending = actions.saveDocument();
      reply(result);
      expect(await pending).to.deep.equal({ ok: false, error: 'invalid-response' });
      expectCleanedUp();
    });
  });

  it('settles a failed save post as disconnected and cleans up', async () => {
    port.postMessage = () => { throw new Error('closed'); };
    expect(await actions.saveDocument()).to.deep.equal({ ok: false, error: 'disconnected' });
    expectCleanedUp();
  });

  it('settles a port start failure as disconnected and cleans up', async () => {
    port.start = () => { throw new Error('closed'); };
    expect(await actions.saveDocument()).to.deep.equal({ ok: false, error: 'disconnected' });
    expect(port.postMessage.called).to.equal(false);
    expectCleanedUp();
  });

  it('ignores duplicate save acknowledgements after settling', async () => {
    const pending = actions.saveDocument();
    reply({ ok: true });
    reply({ ok: false, error: 'save-failed' });
    expect(await pending).to.deep.equal({ ok: true });
    expectCleanedUp();
  });

  it('posts comparison messages over a real MessageChannel without response listeners', async () => {
    const channel = new MessageChannel();
    try {
      sinon.spy(channel.port2, 'addEventListener');
      sinon.spy(channel.port2, 'start');
      const messages = [];
      const received = new Promise((resolve) => {
        channel.port1.onmessage = ({ data }) => {
          messages.push(data);
          if (messages.length === 2) resolve();
        };
      });
      const realActions = SDK.createHostActions({ port: channel.port2 });
      expect(realActions.openComparison({ candidate: 'preview', baseline: 'live' })).to.equal(undefined);
      expect(realActions.closeComparison()).to.equal(undefined);
      await received;
      expect(messages).to.deep.equal([
        { action: 'openComparison', details: { candidate: 'preview', baseline: 'live' } },
        { action: 'closeComparison' },
      ]);
      expect(channel.port2.addEventListener.called).to.equal(false);
      expect(channel.port2.start.called).to.equal(false);
      expect(timers.called).to.equal(false);
    } finally {
      channel.port1.close();
      channel.port2.close();
    }
  });

  it('acknowledges saves over a real MessageChannel before a preview comparison', async () => {
    const channel = new MessageChannel();
    try {
      const messages = [];
      const compared = new Promise((resolve) => {
        channel.port1.onmessage = ({ data }) => {
          messages.push(data);
          if (data.action === 'saveDocument') {
            channel.port1.postMessage({ action: 'sdkResponse', requestId: data.requestId, result: { ok: true } });
          } else resolve();
        };
      });
      const realActions = SDK.createHostActions({ port: channel.port2 });
      const result = await realActions.saveDocument();
      expect(result).to.deep.equal({ ok: true });
      realActions.openComparison({ candidate: 'preview', baseline: 'live' });
      await compared;
      expect(messages.map(({ action }) => action)).to.deep.equal(['saveDocument', 'openComparison']);
      expect(messages[1]).not.to.have.property('requestId');
      timers.returnValues.forEach((timer) => expect(clearTimers.calledWith(timer)).to.equal(true));
    } finally {
      channel.port1.close();
      channel.port2.close();
    }
  });

  it('requires ready and a transferred port, then keeps the original handshake port', async () => {
    const channel = new MessageChannel();
    const stray = new MessageChannel();
    try {
      const settled = sinon.spy();
      SDK.default.then(settled);
      window.dispatchEvent(new MessageEvent('message', { data: null }));
      window.dispatchEvent(new MessageEvent('message', { data: { ready: true } }));
      window.dispatchEvent(new MessageEvent('message', { data: { context: 'stray' }, ports: [stray.port2] }));
      await Promise.resolve();
      expect(settled.called).to.equal(false);
      const messages = [];
      const received = new Promise((resolve) => {
        channel.port1.onmessage = ({ data }) => {
          messages.push(data);
          if (data.action === 'openComparison') resolve();
        };
      });
      window.dispatchEvent(new MessageEvent('message', {
        data: { ready: true, context: 'original' }, ports: [channel.port2],
      }));
      const sdk = await SDK.default;
      expect(sdk.context).to.equal('original');
      expect(sdk).not.to.have.property('capabilities');
      expect(sdk.actions.saveDocument).to.be.a('function');
      window.dispatchEvent(new MessageEvent('message', {
        data: { ready: true, context: 'replacement' }, ports: [stray.port2],
      }));
      expect(sdk.actions.openComparison({ candidate: 'document', baseline: 'live' })).to.equal(undefined);
      await received;
      expect(messages[0]).to.deep.equal({ action: 'setTitle', details: document.title });
      expect(messages[1]).to.deep.equal({
        action: 'openComparison', details: { candidate: 'document', baseline: 'live' },
      });
    } finally {
      channel.port1.close();
      channel.port2.close();
      stray.port1.close();
      stray.port2.close();
    }
  });
});
