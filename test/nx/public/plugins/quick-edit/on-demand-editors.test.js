import { expect } from '@esm-bundle/chai';
import { setupContentEditableListeners } from '../../../../../nx/public/plugins/quick-edit/src/images.js';

describe('quick-edit on-demand editors', () => {
  let ctx;
  let posted;

  beforeEach(() => {
    document.body.innerHTML = '<main><div>'
      + '<p data-prose-index="1">Hello world</p>'
      + '<p data-prose-index="14"><picture data-prose-index="15"><img></picture></p>'
      + '</div></main>';
    posted = [];
    ctx = { port: { postMessage: (message) => posted.push(message) } };
    setupContentEditableListeners(ctx);
  });

  afterEach(() => {
    document.removeEventListener('mousedown', ctx.editorRequestListener);
    document.body.innerHTML = '';
  });

  const mousedown = (el, init = {}) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ...init }));
  const editorRequests = () => posted.filter((m) => m.type === 'get-editor');

  it('does not request any editors up front', () => {
    expect(editorRequests()).to.have.length(0);
  });

  it('requests the editor for the element the user clicks', () => {
    mousedown(document.querySelector('[data-prose-index="1"]'));
    expect(editorRequests()).to.deep.equal([{ type: 'get-editor', payload: { cursorOffset: 1 } }]);
  });

  it('ignores image clicks and non-primary buttons', () => {
    mousedown(document.querySelector('img'));
    mousedown(document.querySelector('[data-prose-index="1"]'), { button: 2 });
    expect(editorRequests()).to.have.length(0);
  });

  it('installs the listener only once per session', () => {
    setupContentEditableListeners(ctx);
    mousedown(document.querySelector('[data-prose-index="1"]'));
    expect(editorRequests()).to.have.length(1);
  });
});
