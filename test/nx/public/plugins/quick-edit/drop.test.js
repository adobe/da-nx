import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setupDropListeners, handleDropTarget } from '../../../../../nx/public/plugins/quick-edit/src/drop.js';
import { setupImageDropListeners } from '../../../../../nx/public/plugins/quick-edit/src/images.js';

describe('quick-edit native drop targets', () => {
  let ctx;
  let target;
  let sent;
  const drag = (type, { html = '<p>Content</p>', file, assets, y = 20 } = {}) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/html', html);
    if (file) dataTransfer.items.add(file);
    if (assets) dataTransfer.setData('collectionviewdata', JSON.stringify(assets));
    const event = new DragEvent(type, {
      bubbles: true, cancelable: true, clientX: 20, clientY: y, dataTransfer,
    });
    target.dispatchEvent(event);
    return event;
  };
  beforeEach(() => {
    document.body.innerHTML = '<main><div data-block-index="5"><p data-prose-index="9">Block</p></div>'
      + '<p data-prose-index="30">Text</p><picture><img src="/old.png" data-image-index="40" data-image-version="v1"></picture></main>';
    sent = [];
    ctx = { port: { postMessage: (data) => sent.push(data) } };
    setupDropListeners(ctx);
    setupImageDropListeners(ctx);
    target = document.querySelector('[data-prose-index="9"]');
    document.querySelector('[data-block-index]').getBoundingClientRect = () => ({
      top: 10, bottom: 110, left: 5, width: 200, height: 100,
    });
    sinon.stub(window, 'FileReader').value(class {
      readAsDataURL() { this.result = 'data:image/png;base64,eA=='; this.onload(); }
    });
  });
  afterEach(() => {
    ctx.destroyDrop();
    document.body.innerHTML = '';
    sinon.restore();
  });
  it('shows native HTML boundaries and sends a drop after the outer block', () => {
    expect(drag('dragover').defaultPrevented).to.equal(true);
    expect(document.querySelector('#qe-drop-indicator').style.top).to.equal('10px');
    drag('dragover', { y: 100 });
    expect(document.querySelector('#qe-drop-indicator').style.top).to.equal('110px');
    drag('drop', { y: 100, html: '<h2>Heading</h2><p>Text</p>' });
    expect(sent).to.deep.equal([{
      type: 'html-drop',
      payload: { html: '<h2>Heading</h2><p>Text</p>', anchor: { kind: 'block', index: 5 }, side: 'after' },
    }]);
    expect(document.querySelector('#qe-drop-indicator')).to.equal(null);
  });
  it('gives native image Files priority over HTML and uses indexed replacement', () => {
    target = document.querySelector('img');
    const file = new File(['x'], 'new.png', { type: 'image/png' });
    drag('dragenter', { file });
    expect(target.closest('picture').classList.contains('image-drop-target')).to.equal(true);
    drag('drop', { file });
    expect(sent[0].type).to.equal('image-replace');
    expect(sent[0].payload).to.include({ proseIndex: 40, imageVersion: 'v1', fileName: 'new.png' });
    expect(sent[0].payload.requestId).to.be.a('string');
    expect(sent).to.have.length(1);
  });
  it('adapts Assets metadata to an image replacement instead of inserting its HTML', () => {
    target = document.querySelector('img');
    drag('drop', { assets: [{ id: 'asset' }] });
    expect(sent).to.have.length(1);
    expect(sent[0].type).to.equal('image-replace');
    expect(sent[0].payload).to.include({ proseIndex: 40, imageVersion: 'v1' });
    expect(sent[0].payload.assets).to.deep.equal([{ id: 'asset' }]);
    expect(sent[0].payload).not.to.have.property('imageData');
  });
  it('does not highlight generated images with no document index', () => {
    target = document.querySelector('img');
    target.removeAttribute('data-image-index');
    drag('dragenter', { assets: [{ id: 'asset' }] });
    expect(target.closest('picture').classList.contains('image-drop-target')).to.equal(false);
  });
  it('clears cancelled and out-of-main drags and ignores empty and read-only drops', () => {
    drag('dragover');
    document.dispatchEvent(new Event('dragend'));
    expect(document.querySelector('#qe-drop-indicator')).to.equal(null);
    drag('drop', { html: '' });
    ctx.readOnly = true;
    expect(drag('drop').defaultPrevented).to.equal(false);
    target = document.querySelector('img');
    drag('drop', { assets: [{ id: 'asset' }] });
    ctx.readOnly = false;
    target = document.querySelector('p');
    drag('dragover');
    target = document.body;
    drag('dragover');
    expect(document.querySelector('#qe-drop-indicator')).to.equal(null);
    drag('drop');
    expect(sent).to.have.length(0);
  });
  it('offers an insertion point on empty pages', () => {
    document.querySelector('main').innerHTML = '';
    target = document.querySelector('main');
    drag('drop', { html: '<p>First</p>' });
    expect(sent[0].payload.anchor).to.deep.equal({ kind: 'main', index: 0 });
  });
  it('resolves bridged HTML and image targets without mutating content', () => {
    ctx.documentVersion = 'document-v1';
    const hit = sinon.stub(document, 'elementFromPoint').returns(target);
    handleDropTarget({ phase: 'hover', kind: 'html', x: 20, y: 100 }, ctx);
    expect(document.querySelector('#qe-drop-indicator')).not.to.equal(null);
    handleDropTarget({
      phase: 'resolve', kind: 'html', x: 20, y: 100, requestId: 'html',
    }, ctx);
    expect(sent[0]).to.deep.equal({
      type: 'drop-target',
      payload: {
        requestId: 'html',
        documentVersion: 'document-v1',
        target: { anchor: { kind: 'block', index: 5 }, side: 'after' },
      },
    });
    hit.returns(document.querySelector('img'));
    handleDropTarget({
      phase: 'resolve', kind: 'image', x: 20, y: 100, requestId: 'image',
    }, ctx);
    expect(sent[1].payload.target).to.include({ proseIndex: 40, imageVersion: 'v1' });
    ctx.readOnly = true;
    handleDropTarget({
      phase: 'resolve', kind: 'html', x: 20, y: 100, requestId: 'readonly',
    }, ctx);
    expect(sent[2].payload.target).to.equal(null);
    ctx.readOnly = false;
    ctx.pendingNodeUpdateId = 'unacknowledged-edit';
    handleDropTarget({
      phase: 'resolve', kind: 'html', x: 20, y: 100, requestId: 'pending',
    }, ctx);
    expect(sent[3].payload.target).to.equal(null);
    ctx.pendingNodeUpdateId = null;
    ctx.reloadRequested = true;
    handleDropTarget({
      phase: 'resolve', kind: 'html', x: 20, y: 100, requestId: 'resync',
    }, ctx);
    expect(sent[4].payload.target).to.equal(null);
    expect(document.querySelectorAll('main p')).to.have.length(2);
  });
});
