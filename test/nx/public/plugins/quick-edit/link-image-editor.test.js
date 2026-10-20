import { expect } from '@esm-bundle/chai';
import { setEditorState } from '../../../../../nx/public/plugins/quick-edit/src/prose.js';

const URL_TEXT = 'https://delivery-p1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:1/as/hero.jpg';

describe('quick-edit mini-editor with a link-image', () => {
  let ctx;
  let posted;
  let view;

  // The iframe loads da-parser from prod; skip until prod ships 2.2.0 (editAs).
  before(async function skipUntilParserShips() {
    const { getSchema } = await import('https://da.live/deps/da-parser/dist/index.js');
    if (!getSchema().nodes.image.spec.attrs.editAs) this.skip();
  });

  beforeEach(() => {
    document.body.innerHTML = '<main><div>'
      + `<p data-prose-index="1">Hi <a href="${URL_TEXT}" data-edit-as="image" data-image-index="4">${URL_TEXT}</a></p>`
      + '<p data-prose-index="9">After <img src="/x.png" data-image-index="13"></p>'
      + '</div></main>';
    posted = [];
    ctx = { readOnly: true, port: { postMessage: (message) => posted.push(message) } };
    setEditorState(1, {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hi ' },
        { type: 'image', attrs: { src: URL_TEXT, alt: 'Hero', editAs: 'image' } },
      ],
    }, ctx);
    view = document.querySelector('.prosemirror-editor').view;
  });

  afterEach(() => {
    view?.destroy();
    document.body.innerHTML = '';
  });

  const typeBefore = (text) => view.dispatch(view.state.tr.insertText(text, 1));
  const nodeUpdates = () => posted.filter((m) => m.type === 'node-update');

  it('mounts the link-image as a single editor position', () => {
    const image = view.state.doc.firstChild.lastChild;
    expect(image.type.name).to.equal('image');
    expect(image.attrs.editAs).to.equal('image');
    expect(view.dom.querySelector('img').getAttribute('data-image-index')).to.equal('4');
  });

  it('keeps editAs on the node sent to the host after typing before it', () => {
    typeBefore('Hello ');
    const [update] = nodeUpdates();
    expect(!!update).to.equal(true);
    const image = update.payload.node.content.find((child) => child.type === 'image');
    expect(image.attrs.editAs).to.equal('image');
    expect(image.attrs.src).to.equal(URL_TEXT);
  });

  it('re-indexes the link-image in the editor after typing before it', () => {
    typeBefore('Hello ');
    expect(view.dom.querySelector('img').getAttribute('data-image-index')).to.equal('10');
  });

  it('shifts images after the editor by the length of the edit', () => {
    typeBefore('Hello ');
    expect(document.querySelector('img[src="/x.png"]').getAttribute('data-image-index')).to.equal('19');
  });
});
