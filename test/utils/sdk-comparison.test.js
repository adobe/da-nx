import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import * as SDK from '../../nx/utils/sdk.js';

describe('acknowledged workspace SDK actions', () => {
  let port;
  let actions;
  let clock;

  beforeEach(() => {
    expect(SDK.createHostActions).to.be.a('function');
    port = new EventTarget();
    port.postMessage = sinon.spy();
    port.start = sinon.spy();
    actions = SDK.createHostActions({ port, capabilities: { comparison: 1, saveDocument: 1 } });
  });

  afterEach(() => clock?.restore());

  function reply(result, index = 0) {
    const { requestId } = port.postMessage.getCall(index).args[0];
    port.dispatchEvent(new MessageEvent('message', {
      data: { action: 'sdkResponse', requestId, result },
    }));
  }

  it('rejects unsupported hosts without sending a message', async () => {
    actions = SDK.createHostActions({ port });
    const result = await actions.openComparison({ candidate: 'document', baseline: 'live' });
    expect(result.ok).to.equal(false);
    expect(result.error).to.equal('unsupported');
    expect(port.postMessage.called).to.equal(false);
  });

  it('sends a narrow comparison request and waits for its acknowledgement', async () => {
    const pending = actions.openComparison({ candidate: 'document', baseline: 'live' });
    expect(port.postMessage.firstCall.args[0]).to.include({ action: 'openComparison' });
    expect(port.postMessage.firstCall.args[0].details).to.deep.equal({ candidate: 'document', baseline: 'live' });
    reply({ ok: true });
    expect(await pending).to.deep.equal({ ok: true });
  });

  it('does not accept arbitrary content or URL comparison inputs', async () => {
    const result = await actions.openComparison({ candidate: 'https://example.com', baseline: 'live' });
    expect(result).to.deep.equal({ ok: false, error: 'invalid-comparison' });
    expect(port.postMessage.called).to.equal(false);
  });

  it('correlates simultaneous requests and ignores unrelated responses', async () => {
    const comparison = actions.openComparison({ candidate: 'preview', baseline: 'live' });
    const save = actions.saveDocument();
    const firstId = port.postMessage.firstCall.args[0].requestId;
    expect(firstId).not.to.equal(port.postMessage.secondCall.args[0].requestId);
    port.dispatchEvent(new MessageEvent('message', { data: { action: 'sdkResponse', requestId: 'unrelated', result: { ok: true } } }));
    reply({ ok: false, error: 'save-failed' }, 1);
    reply({ ok: true }, 0);
    expect(await save).to.deep.equal({ ok: false, error: 'save-failed' });
    expect(await comparison).to.deep.equal({ ok: true });
  });

  it('times out without retrying a lost request', async () => {
    clock = sinon.useFakeTimers();
    const pending = actions.closeComparison();
    clock.tick(15000);
    expect(await pending).to.deep.equal({ ok: false, error: 'timeout' });
    expect(port.postMessage.callCount).to.equal(1);
  });

  it('surfaces malformed replies and closed ports as errors', async () => {
    const pending = actions.saveDocument();
    reply('bad');
    expect(await pending).to.deep.equal({ ok: false, error: 'invalid-response' });
    port.postMessage = () => { throw new Error('closed'); };
    expect(await actions.saveDocument()).to.deep.equal({ ok: false, error: 'disconnected' });
  });

  it('includes the actions in the existing SDK handshake', async () => {
    const channel = new MessageChannel();
    window.dispatchEvent(new MessageEvent('message', {
      data: { ready: true, capabilities: { comparison: 1 } }, ports: [channel.port2],
    }));
    const sdk = await SDK.default;
    expect(sdk.actions.openComparison).to.be.a('function');
    expect(sdk.actions.saveDocument).to.be.a('function');
    expect(sdk.capabilities.comparison).to.equal(1);
    channel.port1.close();
    channel.port2.close();
  });
});
