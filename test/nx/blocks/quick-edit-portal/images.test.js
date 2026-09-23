import { expect } from '@esm-bundle/chai';
import { handleImageReplace } from '../../../../nx/blocks/quick-edit-portal/src/images.js';
import { getImageDocumentVersion } from '../../../../nx/utils/image-document-version.js';

describe('standalone quick-edit image replacement', () => {
  const imageData = 'data:image/png;base64,iVBORw0KGgo=';
  let savedFetch;
  let ctx;
  let posted;
  let doc;
  let changed;
  let uploads;

  beforeEach(() => {
    savedFetch = window.fetch;
    uploads = [];
    window.fetch = async (url, opts) => {
      uploads.push({ url, opts });
      return new Response('', { status: 201 });
    };
    const images = new Map([
      [2, { type: { name: 'image' }, attrs: { src: '/same.png', alt: 'First' } }],
      [3, { type: { name: 'image' }, attrs: { src: '/same.png', alt: 'Second' } }],
    ]);
    doc = {
      nodeAt: (pos) => images.get(pos),
      descendants: (fn) => images.forEach((node, pos) => fn(node, pos)),
    };
    const tr = {
      setNodeMarkup(pos, type, attrs) {
        this.pos = pos;
        this.attrs = attrs;
        return this;
      },
    };
    posted = [];
    ctx = {
      owner: 'org',
      repo: 'site',
      path: '/page',
      view: {
        state: { doc, tr },
        dispatch(transaction) { changed = transaction; },
      },
      port: { postMessage: (message) => posted.push(message) },
    };
    changed = null;
  });

  afterEach(() => { window.fetch = savedFetch; });

  const request = () => ({
    imageData,
    fileName: 'pic.png',
    proseIndex: 3,
    requestId: 'upload-2',
    originalSrc: '/same.png',
    imageVersion: getImageDocumentVersion(doc),
  });

  it('updates only the indexed image when URLs match', async () => {
    await handleImageReplace(request(), ctx);

    expect(uploads).to.have.length(1);
    expect(changed.pos).to.equal(3);
    expect(changed.attrs.alt).to.equal('Second');
    expect(changed.attrs.src).to.contain('/org/site/.page/pic.png');
    expect(doc.nodeAt(2).attrs.src).to.equal('/same.png');
    expect(posted.at(-1).payload.requestId).to.equal('upload-2');
  });

  it('rejects a stale image version before upload', async () => {
    const stale = getImageDocumentVersion(doc);
    ctx.view.state.doc = { ...doc };
    await handleImageReplace({ ...request(), imageVersion: stale }, ctx);

    expect(uploads).to.have.length(0);
    expect(changed).to.equal(null);
    expect(posted.at(-1).payload.error).to.contain('out of date');
  });

  it('rejects an ambiguous old URL-only request', async () => {
    await handleImageReplace({ imageData, fileName: 'pic.png', originalSrc: '/same.png' }, ctx);

    expect(uploads).to.have.length(0);
    expect(changed).to.equal(null);
    expect(posted.at(-1).payload.error).to.contain('ambiguous');
  });
});
