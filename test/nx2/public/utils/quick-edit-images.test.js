import { expect } from '@esm-bundle/chai';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import {
  getImageDocumentVersion, resolveImagePosition, updateImageInDocument,
} from '../../../../nx2/public/utils/quick-edit-images.js';
import { getImageDocumentVersion as getLegacyVersion } from '../../../../nx/utils/image-document-version.js';

describe('shared quick-edit image utilities', () => {
  let schema;
  let state;
  let view;

  beforeEach(() => {
    schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: { content: 'inline*', group: 'block' },
        text: { group: 'inline' },
        image: {
          inline: true,
          group: 'inline',
          attrs: { src: {}, alt: { default: null } },
        },
      },
      marks: { strong: {} },
    });
    const first = schema.nodes.image.create({ src: '/same.png', alt: 'First' });
    const second = schema.nodes.image.create({ src: '/same.png', alt: 'Second' }, null, [
      schema.marks.strong.create(),
    ]);
    const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, [
      schema.text('a'), first, second,
    ]));
    state = EditorState.create({ schema, doc });
    view = {
      get state() { return state; },
      dispatch(transaction) { state = state.apply(transaction); },
    };
  });

  const request = (doc, overrides = {}) => ({
    doc,
    proseIndex: 3,
    requestId: 'upload-1',
    imageVersion: getImageDocumentVersion(doc),
    originalSrc: '/same.png',
    ...overrides,
  });

  it('reuses a snapshot version across the shared and legacy imports', () => {
    expect(getLegacyVersion).to.equal(getImageDocumentVersion);
    const version = getImageDocumentVersion(state.doc);
    expect(getImageDocumentVersion(state.doc)).to.equal(version);
    expect(getLegacyVersion(state.doc)).to.equal(version);
    view.dispatch(state.tr.insertText('before ', 2));
    expect(getImageDocumentVersion(state.doc)).not.to.equal(version);
  });

  it('resolves the indexed image even when URLs match', () => {
    expect(resolveImagePosition(request(state.doc))).to.equal(3);
  });

  it('rejects stale and missing versions without falling back to the URL', () => {
    const stale = request(state.doc);
    view.dispatch(state.tr.insertText('before ', 2));
    expect(() => resolveImagePosition({ ...stale, doc: state.doc })).to.throw('out of date');
    expect(() => resolveImagePosition(request(state.doc, { imageVersion: undefined })))
      .to.throw('out of date');
  });

  it('rejects missing, negative, fractional, and non-image indices in modern requests', () => {
    [undefined, null, -1, 1.5, 1].forEach((proseIndex) => {
      expect(() => resolveImagePosition(request(state.doc, { proseIndex })))
        .to.throw('no longer valid');
    });
  });

  it('requires a version for an indexed request without a request ID', () => {
    expect(() => resolveImagePosition(request(state.doc, {
      requestId: undefined, imageVersion: undefined,
    }))).to.throw('out of date');
  });

  it('accepts a unique legacy filename match across paths and query strings', () => {
    view.dispatch(state.tr.delete(3, 4));
    expect(resolveImagePosition({
      doc: state.doc, originalSrc: 'https://example.com/images/same.png?width=200#image',
    })).to.equal(2);
  });

  it('rejects ambiguous and missing legacy filename matches', () => {
    [undefined, '', '/same.png', '/missing.png'].forEach((originalSrc) => {
      expect(() => resolveImagePosition({ doc: state.doc, originalSrc }))
        .to.throw('missing or ambiguous');
    });
  });

  it('replaces only the captured image and preserves its attributes and marks', () => {
    const target = state.doc.nodeAt(3);
    updateImageInDocument({ view, target, newSrc: '/new.png' });
    expect(state.doc.nodeAt(2).attrs.src).to.equal('/same.png');
    expect(state.doc.nodeAt(3).attrs).to.deep.equal({ src: '/new.png', alt: 'Second' });
    expect(state.doc.nodeAt(3).marks).to.deep.equal(target.marks);
  });

  it('follows the captured image through an unrelated edit', () => {
    const target = state.doc.nodeAt(3);
    view.dispatch(state.tr.insertText('before ', 2));
    updateImageInDocument({ view, target, newSrc: '/new.png' });
    expect(state.doc.nodeAt(3 + 'before '.length).attrs.src).to.equal('/new.png');
  });

  it('rejects a removed target even when a replacement has identical attributes', () => {
    const target = state.doc.nodeAt(3);
    const replacement = schema.nodes.image.create(target.attrs, null, target.marks);
    view.dispatch(state.tr.replaceWith(3, 4, replacement));
    expect(() => updateImageInDocument({ view, target, newSrc: '/new.png' }))
      .to.throw('no longer available');
    expect(state.doc.nodeAt(3)).to.equal(replacement);
    expect(state.doc.nodeAt(3).attrs.src).to.equal('/same.png');
  });

  it('rejects a target whose attributes changed during upload', () => {
    const target = state.doc.nodeAt(3);
    view.dispatch(state.tr.setNodeMarkup(3, null, { ...target.attrs, alt: 'Changed' }));
    expect(() => updateImageInDocument({ view, target, newSrc: '/new.png' }))
      .to.throw('no longer available');
    expect(state.doc.nodeAt(3).attrs).to.deep.equal({ src: '/same.png', alt: 'Changed' });
  });

  it('rejects the same image node reused at multiple positions without dispatching', () => {
    const target = state.doc.nodeAt(3);
    view.dispatch(state.tr.insert(4, target));
    const { doc } = state;
    expect(() => updateImageInDocument({ view, target, newSrc: '/new.png' }))
      .to.throw('no longer available');
    expect(state.doc).to.equal(doc);
  });
});
