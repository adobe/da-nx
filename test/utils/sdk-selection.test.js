import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import * as SDK from '../../nx/utils/sdk.js';

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
