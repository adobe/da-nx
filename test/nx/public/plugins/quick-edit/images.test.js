import { expect } from '@esm-bundle/chai';
import {
  setupImageDropListeners, updateImageSrc, handleImageError,
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
    window.FileReader = originalReader;
    document.body.innerHTML = '';
  });

  function drop(img) {
    const e = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', {
      value: { files: [new File(['image'], 'new.png', { type: 'image/png' })] },
    });
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
});
