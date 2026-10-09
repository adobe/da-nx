import { expect } from '@esm-bundle/chai';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { handleImageReplace } from '../../../../nx/blocks/quick-edit-portal/src/images.js';
import { getImageDocumentVersion } from '../../../../nx2/public/utils/quick-edit-images.js';

describe('standalone quick-edit image replacement', () => {
  const imageData = 'data:image/png;base64,iVBORw0KGgo=';
  let savedFetch;
  let ctx;
  let posted;
  let doc;
  let changed;
  let uploads;
  let state;

  beforeEach(() => {
    savedFetch = window.fetch;
    uploads = [];
    window.fetch = async (url, opts) => {
      uploads.push({ url, opts });
      return new Response('', { status: 201 });
    };
    const schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: { content: 'inline*', group: 'block' },
        text: { group: 'inline' },
        image: { inline: true, group: 'inline', attrs: { src: {}, alt: { default: null } } },
      },
    });
    doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, [
      schema.text('a'),
      schema.nodes.image.create({ src: '/same.png', alt: 'First' }),
      schema.nodes.image.create({ src: '/same.png', alt: 'Second' }),
    ]));
    state = EditorState.create({ schema, doc });
    posted = [];
    ctx = {
      owner: 'org',
      repo: 'site',
      path: '/page',
      view: {
        get state() { return state; },
        dispatch(transaction) {
          state = state.apply(transaction);
          if (transaction.docChanged) changed = transaction;
        },
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
    imageVersion: getImageDocumentVersion(ctx.view.state.doc),
  });

  it('updates only the indexed image when URLs match', async () => {
    await handleImageReplace(request(), ctx);

    expect(uploads).to.have.length(1);
    expect(changed).to.exist;
    expect(state.doc.nodeAt(3).attrs.alt).to.equal('Second');
    expect(state.doc.nodeAt(3).attrs.src).to.contain('/org/site/.page/pic.png');
    expect(state.doc.nodeAt(2).attrs.src).to.equal('/same.png');
    expect(posted.at(-1).payload.requestId).to.equal('upload-2');
  });

  it('rejects a stale image version before upload', async () => {
    const stale = getImageDocumentVersion(doc);
    ctx.view.dispatch(state.tr.insertText('new ', 2));
    changed = null;
    await handleImageReplace({ ...request(), imageVersion: stale }, ctx);

    expect(uploads).to.have.length(0);
    expect(changed).to.equal(null);
    expect(posted.at(-1).payload.error).to.contain('out of date');
  });

  it('tracks the intended image past a concurrent edit and an identical URL', async () => {
    window.fetch = async () => {
      uploads.push(true);
      ctx.view.dispatch(state.tr.insert(3, state.schema.nodes.image.create({
        src: '/same.png', alt: 'New image',
      })));
      return new Response('', { status: 201 });
    };
    await handleImageReplace(request(), ctx);

    expect(uploads).to.have.length(1);
    expect(posted.at(-1).payload.newSrc).to.contain('/org/site/.page/pic.png');
    expect(state.doc.nodeAt(3).attrs).to.include({ src: '/same.png', alt: 'New image' });
    expect(state.doc.nodeAt(4).attrs.alt).to.equal('Second');
    expect(state.doc.nodeAt(4).attrs.src).to.contain('/org/site/.page/pic.png');
  });

  it('accepts an unrelated text edit while the image uploads', async () => {
    window.fetch = async () => {
      uploads.push(true);
      ctx.view.dispatch(state.tr.insertText('before ', 2));
      return new Response('', { status: 201 });
    };
    await handleImageReplace(request(), ctx);

    expect(posted.at(-1).payload.newSrc).to.contain('/org/site/.page/pic.png');
    expect(state.doc.nodeAt(3 + 'before '.length).attrs.alt).to.equal('Second');
    expect(state.doc.nodeAt(3 + 'before '.length).attrs.src).to.contain('/org/site/.page/pic.png');
  });

  it('rejects a removed target even when another image has the same URL', async () => {
    window.fetch = async () => {
      uploads.push(true);
      ctx.view.dispatch(state.tr.delete(3, 4).insert(3, state.schema.nodes.image.create({
        src: '/same.png', alt: 'Replacement',
      })));
      return new Response('', { status: 201 });
    };
    await handleImageReplace(request(), ctx);

    expect(uploads).to.have.length(1);
    expect(posted.at(-1).payload.error).to.contain('no longer available');
    expect(state.doc.nodeAt(3).attrs).to.include({ src: '/same.png', alt: 'Replacement' });
  });

  it('refuses an image node reused in two positions', async () => {
    ctx.view.dispatch(state.tr.insert(4, state.doc.nodeAt(3)));
    await handleImageReplace(request(), ctx);

    expect(uploads).to.have.length(1);
    expect(posted.at(-1).payload.error).to.contain('no longer available');
    expect(state.doc.nodeAt(3).attrs.src).to.equal('/same.png');
    expect(state.doc.nodeAt(4).attrs.src).to.equal('/same.png');
  });

  it('rejects an ambiguous old URL-only request', async () => {
    await handleImageReplace({ imageData, fileName: 'pic.png', originalSrc: '/same.png' }, ctx);

    expect(uploads).to.have.length(0);
    expect(changed).to.equal(null);
    expect(posted.at(-1).payload.error).to.contain('ambiguous');
  });
});
