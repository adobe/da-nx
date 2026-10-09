import { expect } from '@esm-bundle/chai';
import { createEditorActions } from '../../../nx/utils/editor-sdk.js';

const wait = () => new Promise((resolve) => { setTimeout(resolve, 20); });

describe('editor extension SDK', () => {
  let channel;
  let actions;

  beforeEach(() => {
    channel = new MessageChannel();
    actions = createEditorActions(channel.port2, { editor: 1 });
  });

  afterEach(async () => {
    channel.port1.postMessage({ action: 'editorClosed' });
    await wait();
    channel.port1.close();
    channel.port2.close();
  });

  it('correlates concurrent responses regardless of their order', async () => {
    const messages = [];
    channel.port1.onmessage = ({ data }) => {
      messages.push(data);
      if (messages.length === 2) {
        [...messages].reverse().forEach(({ requestId, action }) => {
          channel.port1.postMessage({ action: 'editorResponse', requestId, details: action });
        });
      }
    };
    const [first, second] = await Promise.all([
      actions.describeBlock({ html: '<table></table>' }),
      actions.getEditorConfig(),
    ]);
    expect(first).to.equal('describeBlock');
    expect(second).to.equal('getEditorConfig');
  });

  it('rejects requests to hosts without the editor capability', async () => {
    const old = createEditorActions(channel.port2);
    try {
      await old.getEditorConfig();
      expect.fail('Expected unsupported host');
    } catch (err) {
      expect(err.code).to.equal('UNSUPPORTED');
    }
  });

  it('delivers initial snapshots before the subscribe acknowledgement and unsubscribes', async () => {
    let subscriptionId;
    const snapshots = [];
    channel.port1.onmessage = ({ data }) => {
      subscriptionId = data.details.subscriptionId;
      if (data.action === 'subscribeDocument') {
        channel.port1.postMessage({ action: 'editorSnapshot', subscriptionId, details: { revision: 0 } });
      }
      channel.port1.postMessage({ action: 'editorResponse', requestId: data.requestId, details: {} });
    };
    const unsubscribe = await actions.subscribeDocument((data) => snapshots.push(data));
    expect(snapshots).to.deep.equal([{ revision: 0 }]);
    await unsubscribe();
    channel.port1.postMessage({ action: 'editorSnapshot', subscriptionId, details: { revision: 1 } });
    await wait();
    expect(snapshots).to.have.lengthOf(1);
  });

  it('preserves structured host errors', async () => {
    channel.port1.onmessage = ({ data }) => channel.port1.postMessage({
      action: 'editorResponse',
      requestId: data.requestId,
      error: { code: 'STALE_REVISION', message: 'The page changed.' },
    });
    try {
      await actions.applyChanges({ revision: 0 });
      expect.fail('Expected stale request');
    } catch (err) {
      expect(err.code).to.equal('STALE_REVISION');
      expect(err.message).to.equal('The page changed.');
    }
  });

  it('rejects pending and future requests when the host closes', async () => {
    const pending = actions.getEditorConfig().catch((err) => err);
    channel.port1.postMessage({ action: 'editorClosed' });
    expect((await pending).code).to.equal('UNAVAILABLE');
    try {
      await actions.getEditorConfig();
      expect.fail('Expected disconnected request');
    } catch (err) {
      expect(err.code).to.equal('UNAVAILABLE');
    }
  });
});
