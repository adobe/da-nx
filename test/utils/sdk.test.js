import { expect } from '@esm-bundle/chai';
import DA_SDK from '../../nx/utils/sdk.js';

const TIMEOUT = 500;

function withTimeout(promise) {
  return Promise.race([
    promise.then((value) => ({ settled: 'resolved', value }), (value) => ({ settled: 'rejected', value })),
    new Promise((r) => { setTimeout(() => r({ settled: 'pending' }), TIMEOUT); }),
  ]);
}

// Mirrors the host in da-live blocks/canvas/ew-panel-extensions/iframe-protocol.js
// (and blocks/edit/da-library/da-library.js): the selection is posted to the
// iframe window, but errors are posted back over the MessageChannel port.
const host = { selection: null };
const channel = new MessageChannel();
channel.port1.onmessage = (e) => {
  if (e.data?.action !== 'getSelection') return;
  if (!host.selection) {
    channel.port1.postMessage({ action: 'error', details: 'No selection found' });
    return;
  }
  window.postMessage({ action: 'sendSelection', details: host.selection }, '*');
};
window.postMessage({ ready: true, project: {}, context: {} }, '*', [channel.port2]);

const { actions } = await DA_SDK;

describe('DA_SDK getSelection', () => {
  it('resolves with the selection when the host has one', async () => {
    host.selection = '<p>hi</p>';
    const result = await withTimeout(actions.getSelection());
    expect(result).to.deep.equal({ settled: 'resolved', value: '<p>hi</p>' });
  });

  it('rejects when the host replies with an error for an empty selection', async () => {
    host.selection = null;
    const result = await withTimeout(actions.getSelection());
    expect(result).to.deep.equal({ settled: 'rejected', value: 'No selection found' });
  });
});
