import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

describe('SDK setPrompt', () => {
  let channel;
  let actions;
  let send;

  before(async () => {
    const { default: sdk } = await import('../../nx/utils/sdk.js');
    channel = new MessageChannel();
    send = sinon.spy(channel.port2, 'postMessage');
    window.dispatchEvent(new MessageEvent('message', {
      data: { ready: true, context: { org: 'adobe', repo: 'demo' } },
      ports: [channel.port2],
    }));
    ({ actions } = await sdk);
  });

  beforeEach(() => send.resetHistory());

  after(() => {
    channel.port1.close();
    channel.port2.close();
    sinon.restore();
  });

  it('prefills chat by default without automatically submitting', () => {
    expect(actions.setPrompt('Hello')).to.equal(undefined);
    expect(send.firstCall.args[0]).to.deep.equal({
      action: 'setPrompt', details: { text: 'Hello', autoSend: false },
    });
  });

  it('allows the caller to explicitly submit the prompt', () => {
    actions.setPrompt('Hello', { autoSend: true });
    expect(send.firstCall.args[0]).to.deep.equal({
      action: 'setPrompt', details: { text: 'Hello', autoSend: true },
    });
  });

  it('preserves the existing setPrompt and showPanel commands', () => {
    actions.setPrompt('Draft');
    actions.showPanel('chat');
    expect(send.firstCall.args[0]).to.deep.equal({
      action: 'setPrompt', details: { text: 'Draft', autoSend: false },
    });
    expect(send.secondCall.args[0]).to.deep.equal({ action: 'showPanel', details: 'chat' });
  });
});
