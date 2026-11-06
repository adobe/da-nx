import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import loadQuickEdit from '../../../../../nx/public/plugins/quick-edit/quick-edit.js';

describe('quick-edit drop target channel integration', () => {
  it('resolves host drop targets through the existing INIT port once the body is set', async () => {
    const url = window.location.href;
    const channel = new MessageChannel();
    window.history.replaceState(null, '', '?controller=parent');
    document.body.innerHTML = '<main><p data-prose-index="1">Existing</p></main>';
    const response = (type) => new Promise((resolve) => {
      channel.port1.onmessage = ({ data }) => { if (data.type === type) resolve(data); };
    });
    const resolveAt = async (requestId) => {
      const resolved = response('drop-target');
      channel.port1.postMessage({
        type: 'drop-target',
        payload: { phase: 'resolve', kind: 'html', x: 15, y: 29, requestId },
      });
      return (await resolved).payload;
    };
    try {
      await loadQuickEdit({}, async () => {});
      const ready = response('ready');
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        ports: [channel.port2],
        data: { type: 'init', payload: { config: { canWrite: true } } },
      }));
      await ready;
      sinon.stub(document, 'elementFromPoint').callsFake(() => document.querySelector('main p'));

      expect(await resolveAt('before-body')).to.include({ target: null, reason: 'busy' });

      channel.port1.postMessage({
        type: 'set-body',
        payload: {
          body: '<main><p data-prose-index="1">Existing</p></main>',
          documentVersion: 'document-v1',
        },
      });
      sinon.stub(HTMLElement.prototype, 'getBoundingClientRect').returns({
        top: 10, bottom: 30, left: 10, width: 100, height: 20,
      });
      expect(await resolveAt('after-body')).to.deep.equal({
        requestId: 'after-body',
        documentVersion: 'document-v1',
        target: { anchor: { kind: 'text', index: 1 }, side: 'after' },
      });
    } finally {
      channel.port1.close();
      channel.port2.close();
      sinon.restore();
      document.body.innerHTML = '';
      window.history.replaceState(null, '', url);
    }
  });
});
