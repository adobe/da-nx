import { expect } from '@esm-bundle/chai';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { editorImageIndex } from '../../../../../nx/public/plugins/quick-edit/src/dom-index.js';
import { imageSelectPayload } from '../../../../../nx/public/plugins/quick-edit/src/selection.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    image: {
      group: 'inline',
      inline: true,
      attrs: { src: { default: null } },
      toDOM: (node) => ['img', { src: node.attrs.src }],
    },
  },
});

// Same shape as createEditor in src/prose.js: a one-block doc mounted in a
// `.prosemirror-editor` whose data-prose-index is the host block's content start,
// with images rendered through a <picture> node view like image-wrapper.js.
function mountEditor(hostIndex, content) {
  const parent = document.createElement('div');
  parent.className = 'prosemirror-editor';
  parent.setAttribute('data-prose-index', hostIndex);
  document.body.append(parent);
  const doc = schema.node('doc', null, [schema.node('paragraph', null, content)]);
  const view = new EditorView(parent, {
    state: EditorState.create({ doc, schema }),
    nodeViews: {
      image: (node) => {
        const picture = document.createElement('picture');
        const img = document.createElement('img');
        img.src = node.attrs.src;
        picture.append(img);
        return { dom: picture };
      },
    },
  });
  parent.view = view;
  return { parent, view };
}

describe('editorImageIndex', () => {
  let mounted;
  afterEach(() => {
    mounted?.view.destroy();
    document.body.innerHTML = '';
  });

  it('maps an image inside a mounted editor to its host prose position', () => {
    mounted = mountEditor(40, [
      schema.text('ab'),
      schema.node('image', { src: '/a.png' }),
      schema.node('image', { src: '/a.png' }),
    ]);
    const [first, second] = mounted.parent.querySelectorAll('picture');
    // local: paragraph content starts at 1, "ab" is 1-2, images at 3 and 4.
    // host = data-prose-index - 1 + local.
    expect(editorImageIndex(first)).to.equal(42);
    expect(editorImageIndex(second.querySelector('img'))).to.equal(43);
  });

  it('returns null outside a mounted editor', () => {
    const pic = document.createElement('picture');
    document.body.append(pic);
    expect(editorImageIndex(pic)).to.equal(null);
    expect(editorImageIndex(null)).to.equal(null);
  });

  it('gives imageSelectPayload a proseIndex for editor-rendered images', () => {
    mounted = mountEditor(10, [schema.node('image', { src: '/a.png' })]);
    const payload = imageSelectPayload(mounted.parent.querySelector('picture'));
    expect(payload.proseIndex).to.equal(10);
  });
});
