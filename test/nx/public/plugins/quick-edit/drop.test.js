import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setupDropListeners, handleDropTarget } from '../../../../../nx/public/plugins/quick-edit/src/drop.js';
import { setupImageDropListeners } from '../../../../../nx/public/plugins/quick-edit/src/images.js';

describe('quick-edit drop targets', () => {
  let ctx;
  let sent;
  let hit;
  const resolve = (kind, requestId = kind) => {
    handleDropTarget({
      phase: 'resolve', kind, x: 20, y: 100, requestId,
    }, ctx);
    return sent.at(-1).payload;
  };
  const nativeDrop = (target, { html, file } = {}) => {
    const dataTransfer = new DataTransfer();
    if (html) dataTransfer.setData('text/html', html);
    if (file) dataTransfer.items.add(file);
    const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer });
    target.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    document.body.innerHTML = '<main><div data-block-index="5"><p data-prose-index="9">Block</p></div>'
      + '<p data-prose-index="30">Text</p><picture><img src="/old.png" data-image-index="40" data-image-version="v1"></picture></main>';
    sent = [];
    ctx = { port: { postMessage: (data) => sent.push(data) }, documentVersion: 'document-v1' };
    setupDropListeners(ctx);
    setupImageDropListeners(ctx);
    document.querySelector('[data-block-index]').getBoundingClientRect = () => ({
      top: 10, bottom: 110, left: 5, width: 200, height: 100,
    });
    hit = sinon.stub(document, 'elementFromPoint').returns(document.querySelector('[data-prose-index="9"]'));
    sinon.stub(window, 'FileReader').value(class {
      readAsDataURL() { this.result = 'data:image/png;base64,eA=='; this.onload(); }
    });
  });

  afterEach(() => {
    ctx.destroyDrop();
    document.body.innerHTML = '';
    sinon.restore();
  });

  it('resolves html to a block boundary and images only to existing images', () => {
    expect(resolve('html')).to.deep.equal({
      requestId: 'html',
      documentVersion: 'document-v1',
      target: { anchor: { kind: 'block', index: 5 }, side: 'after' },
    });
    expect(resolve('image').target).to.equal(null);
    hit.returns(document.querySelector('img'));
    expect(resolve('image').target).to.include({ proseIndex: 40, imageVersion: 'v1' });
    expect(document.querySelectorAll('main p')).to.have.length(2);
  });

  it('highlights hover targets and clears them on leave', () => {
    handleDropTarget({ phase: 'hover', kind: 'html', x: 20, y: 100 }, ctx);
    expect(document.querySelector('#qe-drop-indicator').style.top).to.equal('110px');
    hit.returns(document.querySelector('img'));
    handleDropTarget({ phase: 'hover', kind: 'image', x: 20, y: 100 }, ctx);
    const picture = document.querySelector('picture');
    expect(document.querySelector('#qe-drop-indicator')).to.equal(null);
    expect(picture.classList.contains('image-drop-target')).to.equal(true);
    handleDropTarget({ phase: 'leave' }, ctx);
    expect(picture.classList.contains('image-drop-target')).to.equal(false);
    expect(sent).to.have.length(0);
  });

  it('replies busy while the document is out of sync, and null when read-only', () => {
    ctx.pendingNodeUpdateId = 'unacknowledged-edit';
    expect(resolve('html')).to.include({ target: null, reason: 'busy' });
    ctx.pendingNodeUpdateId = null;
    ctx.reloadRequested = true;
    expect(resolve('html')).to.include({ target: null, reason: 'busy' });
    ctx.reloadRequested = false;
    ctx.documentVersion = undefined;
    expect(resolve('html')).to.include({ target: null, reason: 'busy' });
    ctx.documentVersion = 'document-v1';
    ctx.readOnly = true;
    expect(resolve('html')).to.not.have.property('reason');
    expect(sent.at(-1).payload.target).to.equal(null);
  });

  it('refuses native html drops and accepts native image Files only on images', () => {
    const htmlDrop = nativeDrop(document.querySelector('[data-prose-index="30"]'), { html: '<p>x</p>' });
    expect(htmlDrop.defaultPrevented).to.equal(true);
    expect(sent).to.have.length(0);
    const file = new File(['x'], 'new.png', { type: 'image/png' });
    nativeDrop(document.querySelector('img'), { file });
    expect(sent).to.have.length(1);
    expect(sent[0].type).to.equal('image-replace');
    expect(sent[0].payload).to.include({ proseIndex: 40, imageVersion: 'v1', fileName: 'new.png' });
  });
});
