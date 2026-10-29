import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  setupImageDropListeners, updateImageSrc, handleImageError, handleAssetImageDrop,
} from '../../../../../nx/public/plugins/quick-edit/src/images.js';

describe('quick-edit image replacement', () => {
  let originalReader;
  let ctx;
  let posted;
  let first;
  let second;

  beforeEach(() => {
    originalReader = window.FileReader;
    window.FileReader = class {
      readAsDataURL() {
        this.result = 'data:image/png;base64,iVBORw0KGgo=';
        this.onload();
      }
    };
    document.body.innerHTML = '<main>'
      + '<picture><img src="/same.png" data-image-index="2" data-image-version="v1"></picture>'
      + '<picture><source srcset="/same.png?width=750&format=webp">'
      + '<img src="/same.png" data-image-index="3" data-image-version="v1"></picture>'
      + '</main>';
    [first, second] = document.querySelectorAll('picture img');
    posted = [];
    ctx = { port: { postMessage: (message) => posted.push(message) } };
    setupImageDropListeners(ctx, document.querySelector('main'));
  });

  afterEach(() => {
    sinon.restore();
    window.FileReader = originalReader;
    document.body.innerHTML = '';
  });

  function drop(img) {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(['image'], 'new.png', { type: 'image/png' }));
    const e = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer });
    img.dispatchEvent(e);
  }

  it('sends the index of the dropped image, not its container or URL', () => {
    drop(second);

    expect(posted).to.have.length(1);
    expect(posted[0].type).to.equal('image-replace');
    expect(posted[0].payload.proseIndex).to.equal(3);
    expect(posted[0].payload.imageVersion).to.equal('v1');
    expect(posted[0].payload.requestId).to.be.a('string');
    expect(posted[0].payload).to.not.have.property('cursorOffset');
  });

  it('updates only the matching picture when URLs are identical', () => {
    drop(second);
    const { requestId } = posted[0].payload;

    updateImageSrc(requestId, '/new.png', ctx);

    expect(first.getAttribute('src')).to.equal('/same.png');
    expect(second.getAttribute('src')).to.equal('/new.png');
    expect(second.closest('picture').querySelector('source').getAttribute('srcset'))
      .to.equal(`${window.location.origin}/new.png?width=750&format=webp`);
    expect(ctx.pendingImageReplacements.size).to.equal(0);
  });

  it('matches concurrent responses to their respective dropped pictures', () => {
    drop(first);
    drop(second);
    const [firstRequest, secondRequest] = posted.map(({ payload }) => payload.requestId);

    updateImageSrc(secondRequest, '/second.png', ctx);
    updateImageSrc(firstRequest, '/first.png', ctx);

    expect(first.getAttribute('src')).to.equal('/first.png');
    expect(second.getAttribute('src')).to.equal('/second.png');
    expect(ctx.pendingImageReplacements.size).to.equal(0);
  });

  it('clears only the failing image when another upload is pending', () => {
    drop(first);
    drop(second);
    const [requestId] = posted.map(({ payload }) => payload.requestId);

    handleImageError('Upload failed', requestId, ctx);

    expect(first.closest('picture').classList.contains('image-uploading')).to.equal(false);
    expect(second.closest('picture').classList.contains('image-uploading')).to.equal(true);
    expect(ctx.pendingImageReplacements.size).to.equal(1);
  });

  it('clears only the relevant upload when its response has no image URL', () => {
    drop(first);
    drop(second);
    const [requestId] = posted.map(({ payload }) => payload.requestId);

    updateImageSrc(requestId, null, ctx);

    expect(first.closest('picture').classList.contains('image-uploading')).to.be.false;
    expect(second.closest('picture').classList.contains('image-uploading')).to.be.true;
    expect(ctx.pendingImageReplacements.size).to.equal(1);
  });

  it('refuses a drop with no image index instead of matching the URL', () => {
    second.removeAttribute('data-image-index');

    drop(second);

    expect(posted).to.have.length(0);
    expect(second.closest('picture').classList.contains('image-uploading')).to.equal(false);
  });

  it('refuses a drop with no document version', () => {
    second.removeAttribute('data-image-version');

    drop(second);

    expect(posted).to.have.length(0);
    expect(ctx.pendingImageReplacements.size).to.equal(0);
  });

  it('rejects an uncorrelated response without changing either image', () => {
    drop(first);
    drop(second);

    updateImageSrc(null, '/wrong.png', ctx);

    expect(first.getAttribute('src')).to.equal('/same.png');
    expect(second.getAttribute('src')).to.equal('/same.png');
    expect(ctx.pendingImageReplacements.size).to.equal(0);
  });

  it('uses the image under bridged drop coordinates for a versioned asset replacement', () => {
    const hit = sinon.stub(document, 'elementFromPoint').returns(second);
    const assets = [{ 'repo:id': 'asset' }];

    handleAssetImageDrop({ assets, x: 15, y: 25 }, ctx);

    expect(hit.calledWithExactly(15, 25)).to.equal(true);
    expect(posted).to.have.length(1);
    expect(posted[0].type).to.equal('image-replace');
    expect(posted[0].payload).to.include({
      proseIndex: 3, imageVersion: 'v1', assets,
    });
    expect(posted[0].payload.requestId).to.be.a('string');
    expect(posted[0].payload).to.not.have.property('imageData');
    expect(second.closest('picture').classList.contains('image-uploading')).to.equal(true);
  });

  it('does not replace images for read-only, non-image, or multiple-asset bridge drops', () => {
    const hit = sinon.stub(document, 'elementFromPoint').returns(second);
    const payload = { assets: [{ 'repo:id': 'asset' }], x: 15, y: 25 };
    ctx.readOnly = true;
    handleAssetImageDrop(payload, ctx);
    expect(hit.called).to.equal(false);
    ctx.readOnly = false;
    hit.returns(document.querySelector('main'));
    handleAssetImageDrop(payload, ctx);
    hit.returns(second);
    handleAssetImageDrop({ ...payload, assets: [...payload.assets, ...payload.assets] }, ctx);
    expect(posted).to.have.length(0);
  });

  it('moves and clears the bridged hover target without starting a replacement', () => {
    const hit = sinon.stub(document, 'elementFromPoint').returns(first);
    const picture = first.closest('picture');
    const otherPicture = second.closest('picture');
    handleAssetImageDrop({ phase: 'hover', x: 15, y: 25 }, ctx);
    expect(picture.classList.contains('image-drop-target')).to.equal(true);
    hit.returns(second);
    handleAssetImageDrop({ phase: 'hover', x: 25, y: 35 }, ctx);
    expect(picture.classList.contains('image-drop-target')).to.equal(false);
    expect(otherPicture.classList.contains('image-drop-target')).to.equal(true);
    handleAssetImageDrop({ phase: 'leave' }, ctx);
    expect(otherPicture.classList.contains('image-drop-target')).to.equal(false);
    expect(posted).to.have.length(0);
    expect(ctx.pendingImageReplacements.size).to.equal(0);
  });

  it('clears bridged highlighting on non-images, invalid positions, or permission loss', () => {
    const hit = sinon.stub(document, 'elementFromPoint').returns(first);
    const picture = first.closest('picture');
    const hover = { phase: 'hover', x: 15, y: 25 };
    handleAssetImageDrop(hover, ctx);
    hit.returns(document.querySelector('main'));
    handleAssetImageDrop(hover, ctx);
    expect(picture.classList.contains('image-drop-target')).to.equal(false);
    hit.returns(first);
    handleAssetImageDrop(hover, ctx);
    handleAssetImageDrop({ ...hover, x: NaN }, ctx);
    expect(picture.classList.contains('image-drop-target')).to.equal(false);
    handleAssetImageDrop(hover, ctx);
    ctx.readOnly = true;
    handleAssetImageDrop(hover, ctx);
    expect(picture.classList.contains('image-drop-target')).to.equal(false);
    ctx.readOnly = false;
    first.removeAttribute('data-image-version');
    handleAssetImageDrop(hover, ctx);
    expect(picture.classList.contains('image-drop-target')).to.equal(false);
    expect(posted).to.have.length(0);
  });

  it('clears the bridged hover target before starting an asset replacement', () => {
    sinon.stub(document, 'elementFromPoint').returns(first);
    const picture = first.closest('picture');
    handleAssetImageDrop({ phase: 'hover', x: 15, y: 25 }, ctx);
    expect(picture.classList.contains('image-drop-target')).to.equal(true);
    handleAssetImageDrop({ assets: [{ 'repo:id': 'asset' }], x: 15, y: 25 }, ctx);
    expect(picture.classList.contains('image-drop-target')).to.equal(false);
    expect(picture.classList.contains('image-uploading')).to.equal(true);
    expect(posted).to.have.length(1);
  });
});
