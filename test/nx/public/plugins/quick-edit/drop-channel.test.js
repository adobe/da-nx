import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import loadQuickEdit from '../../../../../nx/public/plugins/quick-edit/quick-edit.js';

describe('quick-edit native drop channel integration', () => {
  it('sends native HTML and bridged asset drops through the existing INIT port', async () => {
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

      document.querySelector('main').innerHTML = '<picture>'
        + '<img src="/old.png" data-image-index="3" data-image-version="v1"></picture>';
      const img = document.querySelector('img');
      sinon.stub(document, 'elementFromPoint').returns(img);
      const picture = img.closest('picture');
      const highlightChange = (highlighted) => new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          if (picture.classList.contains('image-drop-target') !== highlighted) return;
          observer.disconnect();
          resolve();
        });
        observer.observe(picture, { attributes: true, attributeFilter: ['class'] });
      });
      const highlighted = highlightChange(true);
      channel.port1.postMessage({
        type: 'image-replace', payload: { assets: [], phase: 'hover', x: 15, y: 25 },
      });
      await highlighted;
      expect(picture.classList.contains('image-uploading')).to.equal(false);
      const cleared = highlightChange(false);
      channel.port1.postMessage({
        type: 'image-replace', payload: { assets: [], phase: 'leave' },
      });
      await cleared;
      const replacement = response('image-replace');
      const assets = [{ 'repo:id': 'asset' }];
      channel.port1.postMessage({
        type: 'image-replace', payload: { assets, x: 15, y: 25 },
      });
      const request = await replacement;
      expect(request.payload).to.include({ proseIndex: 3, imageVersion: 'v1' });
      expect(request.payload.assets).to.deep.equal(assets);
      expect(request.payload.requestId).to.be.a('string');
      const hoveredAgain = highlightChange(true);
      channel.port1.postMessage({
        type: 'image-replace', payload: { assets: [], phase: 'hover', x: 15, y: 25 },
      });
      await hoveredAgain;
      const bodyCleared = highlightChange(false);
      channel.port1.postMessage({
        type: 'set-body', payload: { body: '<main><p>Updated</p></main>' },
      });
      await bodyCleared;
    } finally {
      channel.port1.close();
      channel.port2.close();
      sinon.restore();
      document.body.innerHTML = '';
      window.history.replaceState(null, '', url);
    }
  });
});
