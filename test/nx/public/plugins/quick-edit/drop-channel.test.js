import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import loadQuickEdit from '../../../../../nx/public/plugins/quick-edit/quick-edit.js';

describe('quick-edit native drop channel integration', () => {
  it('sends a native HTML drop to the host through the existing INIT port', async () => {
    const url = window.location.href;
    const channel = new MessageChannel();
    window.history.replaceState(null, '', '?controller=parent');
    document.body.innerHTML = '<main><p data-prose-index="1">Existing</p></main>';
    const target = document.querySelector('p');
    sinon.stub(target, 'getBoundingClientRect').returns({
      top: 10, bottom: 30, left: 10, width: 100, height: 20,
    });
    const response = (type) => new Promise((resolve) => {
      channel.port1.onmessage = ({ data }) => { if (data.type === type) resolve(data); };
    });
    try {
      await loadQuickEdit({}, async () => {});
      const ready = response('ready');
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        ports: [channel.port2],
        data: { type: 'init', payload: { config: { canWrite: true } } },
      }));
      await ready;
      const dropped = response('html-drop');
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/html', '<h2>Drop</h2>');
      target.dispatchEvent(new DragEvent('drop', {
        bubbles: true, cancelable: true, clientX: 15, clientY: 29, dataTransfer,
      }));
      expect(await dropped).to.deep.equal({
        type: 'html-drop',
        payload: { html: '<h2>Drop</h2>', anchor: { kind: 'text', index: 1 }, side: 'after' },
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
