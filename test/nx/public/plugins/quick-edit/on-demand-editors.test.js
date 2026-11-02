import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { sendMouse } from '@web/test-runner-commands';
import { setupContentEditableListeners } from '../../../../../nx/public/plugins/quick-edit/src/images.js';
import { setEditorState } from '../../../../../nx/public/plugins/quick-edit/src/prose.js';
import { settleEditor } from '../../../../../nx/public/plugins/quick-edit/src/settle-editor.js';
import { setImageVersion } from '../../../../../nx/public/plugins/quick-edit/src/dom-index.js';
import { installClickForwarding } from '../../../../../nx/public/plugins/quick-edit/src/click-forwarding.js';

describe('quick-edit on-demand editors', () => {
  let ctx;
  let posted;
  let cleanupClickForwarding;

  beforeEach(() => {
    document.body.innerHTML = '<main><div>'
      + '<p data-prose-index="1">Hello world</p>'
      + '<p data-prose-index="14"><picture data-prose-index="15"><img></picture></p>'
      + '</div></main>';
    posted = [];
    cleanupClickForwarding = null;
    ctx = { port: { postMessage: (message) => posted.push(message) } };
    setupContentEditableListeners(ctx);
  });

  afterEach(() => {
    cleanupClickForwarding?.();
    document.removeEventListener('click', ctx.editorRequestListener);
    document.querySelectorAll('.prosemirror-editor').forEach((el) => {
      clearTimeout(el.settleTimer);
      el.view?.destroy();
    });
    document.body.innerHTML = '';
  });

  const click = (el, init = {}) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init }));
  const editorRequests = () => posted.filter((m) => m.type === 'get-editor');
  const paragraph = (text) => ({
    type: 'paragraph',
    content: [{ type: 'text', text }],
  });

  it('does not request any editors up front', () => {
    expect(editorRequests()).to.have.length(0);
  });

  it('requests the editor for the element the user clicks', () => {
    click(document.querySelector('[data-prose-index="1"]'), { clientX: 20, clientY: 30 });
    expect(editorRequests()).to.deep.equal([{ type: 'get-editor', payload: { cursorOffset: 1 } }]);
    expect(ctx.pendingEditor).to.deep.equal({
      element: document.querySelector('[data-prose-index="1"]'), x: 20, y: 30,
    });
  });

  it('does not request an editor on mousedown', () => {
    document.querySelector('[data-prose-index="1"]')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(editorRequests()).to.have.length(0);
  });

  it('ignores image clicks and non-primary buttons', () => {
    click(document.querySelector('img'));
    click(document.querySelector('[data-prose-index="1"]'), { button: 2 });
    expect(editorRequests()).to.have.length(0);
  });

  it('installs the listener only once per session', () => {
    setupContentEditableListeners(ctx);
    click(document.querySelector('[data-prose-index="1"]'));
    expect(editorRequests()).to.have.length(1);
  });

  [
    { html: 'Hello world', selector: 'p', target: undefined },
    { html: '<strong>Hello world</strong>', selector: 'strong', target: undefined },
    { html: '<a href="https://example.com/about">Hello world</a>', selector: 'a', target: 'https://example.com/about' },
  ].forEach(({ html, selector, target }) => {
    it(`forwards the first native ${selector} click before mounting an inline editor`, async () => {
      const element = document.querySelector('[data-prose-index="1"]');
      element.innerHTML = html;
      // Prevent navigation without stopping the capture-phase forwarding listener.
      element.addEventListener('click', (event) => event.preventDefault());
      ctx.port.postMessage = (message) => {
        posted.push(message);
        // Model a fast host reply that replaces the original pressed element.
        if (message.type === 'get-editor') {
          setEditorState(message.payload.cursorOffset, paragraph('Hello world'), ctx);
        }
      };
      cleanupClickForwarding = installClickForwarding({ getPort: () => ctx.port });
      const rect = element.querySelector(selector)?.getBoundingClientRect()
        ?? element.getBoundingClientRect();
      const position = [Math.round(rect.x + 5), Math.round(rect.y + rect.height / 2)];
      const presses = [];
      document.addEventListener('mousedown', () => {
        presses.push({ connected: element.isConnected, messages: [...posted] });
      }, { once: true });

      await sendMouse({ type: 'click', position });

      expect(presses).to.deep.equal([{ connected: true, messages: [] }]);
      const clicks = () => posted.filter((message) => message.type === 'quick-edit-iframe-click');
      expect(clicks()).to.deep.equal([{
        type: 'quick-edit-iframe-click',
        payload: { target, source: 'ew-wysiwyg-layout' },
      }]);
      expect(posted[0]).to.equal(clicks()[0]);
      expect(editorRequests()).to.have.length(1);
      expect(element.isConnected).to.equal(false);
      const editor = document.querySelector('.prosemirror-editor');
      expect(editor.view.hasFocus()).to.equal(true);
      expect(ctx.pendingEditor).to.equal(null);

      // The mounted editor must forward clicks without requesting another editor.
      const editorRect = editor.querySelector('p').getBoundingClientRect();
      await sendMouse({
        type: 'click',
        position: [Math.round(editorRect.x + 5), Math.round(editorRect.y + editorRect.height / 2)],
      });
      expect(clicks()).to.have.length(2);
      expect(editorRequests()).to.have.length(1);
    });
  });

  it('does not replace preceding text when a block title has no exact preview target', () => {
    document.body.innerHTML = '<main><div>'
      + '<p data-prose-index="1">text</p>'
      + '<div class="hero" data-block-index="7">'
      + '<div><div><p data-prose-index="20">body</p></div></div>'
      + '</div></div></main>';
    const before = document.body.innerHTML;

    setEditorState(10, paragraph('new block title'), ctx);

    expect(document.body.innerHTML).to.equal(before);
    expect(posted).to.deep.equal([{ type: 'reload' }]);
  });

  it('coalesces missing-target updates while waiting for a fresh body', () => {
    const before = document.body.innerHTML;

    [10, 11, 12].forEach((offset) => setEditorState(offset, paragraph('update'), ctx));

    expect(document.body.innerHTML).to.equal(before);
    expect(posted).to.deep.equal([{ type: 'reload' }]);
  });

  it('preserves the exact target and its remote cursor when the offset is a string', () => {
    const target = document.querySelector('[data-prose-index="1"]');
    target.setAttribute('data-cursor-remote', 'peer');
    target.setAttribute('data-cursor-remote-color', 'red');

    setEditorState('1', paragraph('Hello world'), ctx);

    const editor = document.querySelector('.prosemirror-editor');
    expect(editor.getAttribute('data-prose-index')).to.equal('1');
    expect(editor.getAttribute('data-cursor-remote')).to.equal('peer');
    expect(editor.getAttribute('data-cursor-remote-color')).to.equal('red');
    expect(document.querySelector('[data-prose-index="14"]').textContent).to.equal('');
    expect(posted).to.deep.equal([]);
  });

  it('keeps subsequent edits exact by shifting unopened text, block, and image indices', () => {
    document.body.innerHTML = '<main><div>'
      + '<p data-prose-index="1">a</p>'
      + '<p data-prose-index="4">b</p>'
      + '<div data-block-index="7"></div>'
      + '<picture data-prose-index="10"><img data-image-index="10"></picture>'
      + '</div></main>';

    setEditorState(1, paragraph('aaaa'), ctx, { lengthDiff: 3 });

    expect(document.querySelector('p[data-prose-index="7"]').textContent).to.equal('b');
    expect(document.querySelector('[data-block-index]').getAttribute('data-block-index')).to.equal('10');
    expect(document.querySelector('picture').getAttribute('data-prose-index')).to.equal('13');
    expect(document.querySelector('img').getAttribute('data-image-index')).to.equal('13');

    const firstEditor = document.querySelector('.prosemirror-editor');
    setEditorState('01', paragraph('aaaaa'), ctx, { lengthDiff: 1 });

    expect(document.querySelector('.prosemirror-editor')).to.equal(firstEditor);
    expect(document.querySelector('p[data-prose-index="8"]').textContent).to.equal('b');
    expect(document.querySelector('[data-block-index]').getAttribute('data-block-index')).to.equal('11');
    expect(document.querySelector('picture').getAttribute('data-prose-index')).to.equal('14');
    expect(document.querySelector('img').getAttribute('data-image-index')).to.equal('14');

    setEditorState(8, paragraph('B'), ctx, { lengthDiff: 0 });

    expect(firstEditor.textContent).to.equal('aaaaa');
    expect(document.querySelector('.prosemirror-editor[data-prose-index="8"]').textContent).to.equal('B');
    expect(posted.filter((message) => message.type === 'reload')).to.deep.equal([]);
  });

  it('requests a resync for invalid offsets without changing the preview', () => {
    const before = document.body.innerHTML;

    setEditorState(1.5, paragraph('wrong target'), ctx);

    expect(document.body.innerHTML).to.equal(before);
    expect(posted).to.deep.equal([{ type: 'reload' }]);
  });

  it('coalesces invalid top-level nodes without replacing either plain text or an open editor', () => {
    const invalidNode = { type: 'table_cell', content: [paragraph('invalid')] };
    const before = document.body.innerHTML;

    setEditorState(1, invalidNode, ctx);
    expect(document.body.innerHTML).to.equal(before);

    setEditorState(1, paragraph('Hello world'), ctx);
    const editor = document.querySelector('.prosemirror-editor');
    setEditorState(1, invalidNode, ctx);

    expect(document.querySelector('.prosemirror-editor')).to.equal(editor);
    expect(editor.textContent).to.equal('Hello world');
    expect(posted).to.deep.equal([{ type: 'reload' }]);
  });

  it('settles the previous editor when focus moves straight into another open editor', async () => {
    document.querySelector('main > div').insertAdjacentHTML('beforeend', '<p data-prose-index="40">Other</p>');
    setEditorState(1, paragraph('Hello world'), ctx);
    setEditorState(40, paragraph('Other'), ctx);
    const first = document.querySelector('.prosemirror-editor[data-prose-index="1"]');
    const second = document.querySelector('.prosemirror-editor[data-prose-index="40"]');
    Object.assign(ctx, { partialReload: true, reload: () => {} });

    // Dispatched directly: real focus events only fire in the focused test page.
    first.view.dom.dispatchEvent(new FocusEvent('blur'));
    second.view.dom.dispatchEvent(new FocusEvent('focus'));
    await new Promise((resolve) => { setTimeout(resolve, 200); });

    expect(first.isConnected).to.equal(false);
    expect(document.querySelector('p[data-prose-index="1"]').textContent).to.equal('Hello world');
    expect(second.isConnected).to.equal(true);
  });

  it('keeps settled image metadata current when an earlier editor changes during decoration', async () => {
    setEditorState(14, {
      type: 'paragraph',
      content: [{ type: 'image', attrs: { src: '/a.png' } }],
    }, ctx, { imageVersion: 'v1' });
    const editor = document.querySelector('.prosemirror-editor[data-prose-index="14"]');
    const oldIndex = Number(editor.querySelector('img').getAttribute('data-image-index'));
    let finishReload;
    const reloading = new Promise((resolve) => { finishReload = resolve; });
    Object.assign(ctx, {
      partialReload: true,
      reload: async (doc, { el }) => {
        await reloading;
        return el;
      },
    });
    const settling = settleEditor(editor, ctx);

    // The earlier paragraph grows by five; the settling editor's document is unchanged.
    setEditorState(1, paragraph('Hello world!!!!!'), ctx, { lengthDiff: 5, imageVersion: 'v2' });
    setImageVersion('v2');
    finishReload();
    await settling;

    const p = document.querySelector('p[data-prose-index="19"]');
    expect(p).to.exist;
    expect(p.querySelector('img').getAttribute('data-image-index')).to.equal(String(oldIndex + 5));
    expect(p.querySelector('img').getAttribute('data-image-version')).to.equal('v2');
    expect(editor.view.isDestroyed).to.equal(true);
  });

  it('decorates host edits after a pause and collaborator edits later', async () => {
    const clock = sinon.useFakeTimers();
    try {
      let reloaded = [];
      Object.assign(ctx, {
        partialReload: true,
        reload: (doc, { el }) => { reloaded.push(el.textContent); },
      });
      document.querySelector('main > div').insertAdjacentHTML('beforeend', '<p data-prose-index="40">Other</p>');
      setEditorState(1, paragraph('Local'), ctx, { origin: 'local' });
      setEditorState(40, paragraph('Remote'), ctx, { origin: 'remote' });
      expect(document.querySelectorAll('.prosemirror-editor')).to.have.length(2);

      await clock.tickAsync(500);
      expect(reloaded).to.deep.equal(['Local']);
      reloaded = [];
      await clock.tickAsync(2500);
      expect(reloaded).to.deep.equal(['Remote']);
      expect(document.querySelectorAll('.prosemirror-editor')).to.have.length(0);
    } finally {
      clock.restore();
    }
  });

  it('blurs an open editor when clicking outside of it', () => {
    document.querySelector('main > div').insertAdjacentHTML('beforeend', '<div class="prosemirror-editor"><div class="ProseMirror" contenteditable="true">x</div></div>');
    const editor = document.querySelector('.ProseMirror');
    editor.focus();
    click(document.querySelector('[data-prose-index="1"]'));
    expect(document.activeElement).to.not.equal(editor);
  });
});
