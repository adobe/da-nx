import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import {
  scheduleSettle, settleEditor, settleOtherEditors, toStaticElement,
} from '../../../../../nx/public/plugins/quick-edit/src/settle-editor.js';
import { updateImageSrc } from '../../../../../nx/public/plugins/quick-edit/src/images.js';
import { setImageVersion } from '../../../../../nx/public/plugins/quick-edit/src/dom-index.js';

function mountEditor(html, { focused = false } = {}) {
  const editorParent = document.createElement('div');
  editorParent.className = 'prosemirror-editor';
  editorParent.setAttribute('data-prose-index', '5');
  const dom = document.createElement('div');
  dom.className = 'ProseMirror';
  dom.innerHTML = html;
  editorParent.append(dom);
  document.querySelector('main > div').append(editorParent);
  editorParent.view = {
    dom,
    state: { doc: {} },
    destroyed: false,
    hasFocus: () => focused,
    destroy() { this.destroyed = true; },
  };
  return editorParent;
}

const decorateButtons = (root) => root.querySelectorAll('p strong > a').forEach((a) => {
  a.className = 'button primary';
  a.closest('p').className = 'button-wrapper';
  a.parentElement.replaceWith(a);
});

// A loader with partialReload whose element reload decorates nothing.
const partialCtx = (extra = {}) => ({ partialReload: true, reload: () => {}, ...extra });

describe('settle-editor', () => {
  beforeEach(() => { document.body.innerHTML = '<main><div></div></main>'; });
  afterEach(() => { document.body.innerHTML = ''; });

  it('converts editor DOM to static markup with icons and the prose index', () => {
    const editorParent = mountEditor('<p>Go :arrow: <a href="https://x.com/:a:">x</a><br class="ProseMirror-trailingBreak"></p>');
    editorParent.setAttribute('data-cursor-remote', 'Ann');
    const el = toStaticElement(editorParent);
    expect(el.outerHTML).to.equal('<p data-prose-index="5" data-cursor-remote="Ann">Go <span class="icon icon-arrow"></span> <a href="https://x.com/:a:">x</a></p>');
  });

  it('replaces an inactive editor with static markup without a decorator', async () => {
    const editorParent = mountEditor('<p><strong><a href="/a">Buy</a></strong></p>');
    const { view } = editorParent;
    await settleEditor(editorParent, partialCtx());
    expect(document.querySelector('.prosemirror-editor')).to.equal(null);
    expect(view.destroyed).to.equal(true);
    const p = document.querySelector('[data-prose-index="5"]');
    expect(p.outerHTML).to.equal('<p data-prose-index="5"><strong><a href="/a">Buy</a></strong></p>');
  });

  it('uses the element returned by the element reload', async () => {
    const editorParent = mountEditor('<p><strong><a href="/a">Buy</a></strong></p>');
    const ctx = {
      partialReload: true,
      reload: (doc, { type, el }) => {
        expect(type).to.equal('element');
        const wrapper = document.createElement('div');
        wrapper.append(el);
        decorateButtons(wrapper);
        return wrapper.firstElementChild;
      },
    };
    await settleEditor(editorParent, ctx);
    const p = document.querySelector('[data-prose-index="5"]');
    expect(p.className).to.equal('button-wrapper');
    expect(p.querySelector('a.button.primary')).to.exist;
  });

  it('keeps a focused editor', async () => {
    const editorParent = mountEditor('<p>Hi</p>', { focused: true });
    const realHasFocus = document.hasFocus;
    document.hasFocus = () => true;
    try {
      await settleEditor(editorParent, partialCtx());
    } finally {
      document.hasFocus = realHasFocus;
    }
    expect(editorParent.isConnected).to.equal(true);
  });

  it('keeps the editor open without partialReload', async () => {
    const editorParent = mountEditor('<p>Go :arrow:</p>');
    const { view } = editorParent;
    let called = false;
    const ctx = { reload: () => { called = true; } };
    await settleEditor(editorParent, ctx);
    settleOtherEditors(null, ctx);
    await new Promise((resolve) => { setTimeout(resolve); });
    expect(called).to.equal(false);
    expect(view.destroyed).to.equal(false);
    expect(editorParent.isConnected).to.equal(true);
    expect(editorParent.textContent).to.equal('Go :arrow:');
  });

  describe('reloadBlocks', () => {
    const mountInBlock = (name) => {
      const editorParent = mountEditor('<p><strong><a href="/a">Buy</a></strong></p>');
      const blockEl = document.createElement('div');
      blockEl.className = `${name} block`;
      blockEl.setAttribute('data-block-index', '42');
      editorParent.replaceWith(blockEl);
      blockEl.append(editorParent);
      return editorParent;
    };
    const blockCtx = (reloadBlocks) => {
      const reload = sinon.spy();
      return partialCtx({ reloadBlocks, reload, port: { postMessage: sinon.spy() } });
    };

    it('asks the host to re-render an opted-in block instead of decorating the element', async () => {
      const editorParent = mountInBlock('cards');
      const ctx = blockCtx(['cards']);
      await settleEditor(editorParent, ctx);
      expect(ctx.port.postMessage.calledOnceWith({ type: 'reload', payload: { blockIndex: 42 } }))
        .to.equal(true);
      expect(ctx.reload.called).to.equal(false);
      // The block-scoped SET_BODY replaces the editor; until then it stays.
      expect(editorParent.isConnected).to.equal(true);
      expect(editorParent.view.destroyed).to.equal(false);
    });

    it('accepts a predicate receiving the block element', async () => {
      const editorParent = mountInBlock('teaser');
      const reloadBlocks = sinon.spy((el) => el.classList.contains('teaser'));
      const ctx = blockCtx(reloadBlocks);
      await settleEditor(editorParent, ctx);
      expect(reloadBlocks.firstCall.args[0]).to.equal(editorParent.parentElement);
      expect(ctx.port.postMessage.calledOnce).to.equal(true);
    });

    it('decorates just the element for other blocks and default content', async () => {
      const inBlock = mountInBlock('hero');
      const ctx = blockCtx(['cards']);
      await settleEditor(inBlock, ctx);
      const outside = mountEditor('<p>Plain</p>');
      await settleEditor(outside, ctx);
      expect(ctx.port.postMessage.called).to.equal(false);
      expect(ctx.reload.calledTwice).to.equal(true);
      expect(document.querySelector('.prosemirror-editor')).to.equal(null);
    });

    it('does not ask for an opted-in block while the editor is active', async () => {
      const editorParent = mountInBlock('cards');
      editorParent.view.hasFocus = () => true;
      const ctx = blockCtx(['cards']);
      const realHasFocus = document.hasFocus;
      document.hasFocus = () => true;
      try {
        await settleEditor(editorParent, ctx);
      } finally {
        document.hasFocus = realHasFocus;
      }
      expect(ctx.port.postMessage.called).to.equal(false);
    });
  });

  it('drops a settle when the editor changed during decoration', async () => {
    const editorParent = mountEditor('<p>Hi</p>');
    const ctx = {
      partialReload: true,
      reload: (doc, { el }) => {
        editorParent.view.state = { doc: {} };
        return el;
      },
    };
    await settleEditor(editorParent, ctx);
    expect(editorParent.isConnected).to.equal(true);
  });

  [5, -5].forEach((shift) => {
    it(`refreshes descendant indices and image versions after an async shift of ${shift}`, async () => {
      const editorParent = mountEditor('<p>Text <picture data-prose-index="110">'
        + '<img data-image-index="110" data-image-version="v1" src="/same.png"></picture>'
        + '<picture data-prose-index="115"><img data-image-index="115" data-image-version="v1" src="/same.png"></picture></p>');
      editorParent.setAttribute('data-prose-index', '100');
      let finishReload;
      const reloading = new Promise((resolve) => { finishReload = resolve; });
      const settling = settleEditor(editorParent, partialCtx({
        reload: async (doc, { el }) => {
          await reloading;
          // Decoration can replace nodes; their old indices still identify them.
          return el.cloneNode(true);
        },
      }));

      editorParent.setAttribute('data-prose-index', 100 + shift);
      editorParent.querySelectorAll('[data-prose-index], [data-image-index]').forEach((node) => {
        ['data-prose-index', 'data-image-index'].forEach((attr) => {
          if (node.hasAttribute(attr)) {
            node.setAttribute(attr, Number(node.getAttribute(attr)) + shift);
          }
        });
      });
      setImageVersion('v2');
      finishReload();
      await settling;

      const p = document.querySelector('main p');
      expect(p.getAttribute('data-prose-index')).to.equal(String(100 + shift));
      expect([...p.querySelectorAll('picture')].map((node) => node.getAttribute('data-prose-index')))
        .to.deep.equal([String(110 + shift), String(115 + shift)]);
      const images = [...p.querySelectorAll('img')];
      expect(images.map((img) => img.getAttribute('data-image-index')))
        .to.deep.equal([String(110 + shift), String(115 + shift)]);
      expect(images.map((img) => img.getAttribute('data-image-version'))).to.deep.equal(['v2', 'v2']);
      expect(images.every((img) => typeof img.listeners?.drop === 'function')).to.equal(true);
      expect(editorParent.view.destroyed).to.equal(true);
    });
  });

  it('removes descendant image metadata cleared while decorating', async () => {
    const editorParent = mountEditor('<p><picture><img data-image-index="6" data-image-version="v1" src="/a.png"></picture></p>');
    await settleEditor(editorParent, partialCtx({
      reload: async (doc, { el }) => {
        const img = editorParent.querySelector('img');
        img.removeAttribute('data-image-index');
        img.removeAttribute('data-image-version');
        return el;
      },
    }));
    const img = document.querySelector('main img');
    expect(img.hasAttribute('data-image-index')).to.equal(false);
    expect(img.hasAttribute('data-image-version')).to.equal(false);
  });

  it('settles every editor except the current one', async () => {
    const current = mountEditor('<p>Current</p>');
    const other = mountEditor('<p>Other</p>');
    other.setAttribute('data-prose-index', '9');
    settleOtherEditors(current, partialCtx());
    await new Promise((resolve) => { setTimeout(resolve); });
    expect(current.isConnected).to.equal(true);
    expect(other.isConnected).to.equal(false);
    expect(document.querySelector('p[data-prose-index="9"]').textContent).to.equal('Other');
  });

  it('drops a remote cursor that moved away while decorating', async () => {
    const editorParent = mountEditor('<p>Hi</p>');
    editorParent.setAttribute('data-cursor-remote', 'Ann');
    editorParent.setAttribute('data-cursor-remote-color', 'red');
    await settleEditor(editorParent, partialCtx({
      reload: (doc, { el }) => {
        editorParent.removeAttribute('data-cursor-remote');
        editorParent.removeAttribute('data-cursor-remote-color');
        return el;
      },
    }));
    const p = document.querySelector('main p[data-prose-index="5"]');
    expect(p.hasAttribute('data-cursor-remote')).to.equal(false);
    expect(p.hasAttribute('data-cursor-remote-color')).to.equal(false);
    expect(p.classList.contains('remote-cursor-indicator')).to.equal(false);
  });

  it('keeps a remote cursor that arrived while decorating', async () => {
    const editorParent = mountEditor('<p>Hi</p>');
    await settleEditor(editorParent, partialCtx({
      reload: (doc, { el }) => {
        editorParent.setAttribute('data-cursor-remote', 'Ann');
        editorParent.setAttribute('data-cursor-remote-color', 'red');
        return el;
      },
    }));
    const p = document.querySelector('main p[data-prose-index="5"]');
    expect(p.getAttribute('data-cursor-remote')).to.equal('Ann');
    expect(p.classList.contains('remote-cursor-indicator')).to.equal(true);
  });

  it('falls back to the plain element when the element reload throws', async () => {
    const editorParent = mountEditor('<p>Hi</p>');
    await settleEditor(editorParent, {
      partialReload: true,
      reload: () => { throw new Error('boom'); },
    });
    expect(document.querySelector('main p[data-prose-index="5"]').textContent).to.equal('Hi');
  });

  it('re-attaches image drop listeners to the static element', async () => {
    const editorParent = mountEditor('<p><picture class="image-drop-target"><img data-image-index="6" src="/a.png"></picture></p>');
    await settleEditor(editorParent, partialCtx());
    const img = document.querySelector('main img[data-image-index="6"]');
    expect(img.listeners?.drop).to.be.a('function');
    expect(img.closest('picture').classList.contains('image-drop-target')).to.equal(false);
  });

  it('does not attach drop listeners when read-only', async () => {
    const editorParent = mountEditor('<p><picture><img data-image-index="6" src="/a.png"></picture></p>');
    await settleEditor(editorParent, partialCtx({ readOnly: true }));
    expect(document.querySelector('main img').listeners).to.equal(undefined);
  });

  it('moves a pending upload to the static image so it finishes there', async () => {
    const editorParent = mountEditor('<p><picture class="image-uploading"><img data-image-index="6" data-image-version="v1" src="/a.png"></picture></p>');
    const oldImg = editorParent.querySelector('img');
    const ctx = partialCtx({
      reload: async () => { setImageVersion('v2'); },
      pendingImageReplacements: new Map([
        ['r1', { img: oldImg, picture: oldImg.closest('picture'), proseIndex: 6 }],
      ]),
    });
    await settleEditor(editorParent, ctx);

    const img = document.querySelector('main img[data-image-index="6"]');
    expect(img).to.not.equal(oldImg);
    expect(img.getAttribute('data-image-version')).to.equal('v2');
    expect(img.closest('picture').classList.contains('image-uploading')).to.equal(true);

    updateImageSrc('r1', '/b.png', ctx);
    expect(img.closest('picture').classList.contains('image-uploading')).to.equal(false);
    expect(img.getAttribute('src')).to.equal('/b.png');
    expect(ctx.pendingImageReplacements.size).to.equal(0);
  });

  it('never leaves a spinner on an image it cannot match to an upload', async () => {
    const editorParent = mountEditor('<p><picture class="image-uploading"><img src="/a.png"></picture></p>');
    await settleEditor(editorParent, partialCtx());
    expect(document.querySelectorAll('main .image-uploading').length).to.equal(0);
  });
});

describe('scheduleSettle', () => {
  let clock;
  let reloads;
  let ctx;

  beforeEach(() => {
    document.body.innerHTML = '<main><div></div></main>';
    clock = sinon.useFakeTimers();
    reloads = 0;
    ctx = partialCtx({ reload: () => { reloads += 1; } });
  });

  afterEach(() => {
    clock.restore();
    document.body.innerHTML = '';
  });

  it('settles local edits after a pause, restarted by every local edit', async () => {
    const editorParent = mountEditor('<p>Hi</p>');
    scheduleSettle(editorParent, ctx, 'local');
    await clock.tickAsync(400);
    scheduleSettle(editorParent, ctx);
    await clock.tickAsync(400);
    expect(reloads).to.equal(0);
    await clock.tickAsync(100);
    expect(reloads).to.equal(1);
    expect(editorParent.isConnected).to.equal(false);
  });

  it('settles remote edits 3s after the first one, even while they continue', async () => {
    const editorParent = mountEditor('<p>Hi</p>');
    scheduleSettle(editorParent, ctx, 'remote');
    await clock.tickAsync(1000);
    scheduleSettle(editorParent, ctx, 'remote');
    await clock.tickAsync(1000);
    scheduleSettle(editorParent, ctx, 'remote');
    await clock.tickAsync(999);
    expect(reloads).to.equal(0);
    await clock.tickAsync(1);
    expect(reloads).to.equal(1);
  });

  it('settles 500ms after the last local edit when remote edits continue', async () => {
    const editorParent = mountEditor('<p>Hi</p>');
    scheduleSettle(editorParent, ctx, 'remote');
    await clock.tickAsync(2000);
    scheduleSettle(editorParent, ctx, 'local');
    await clock.tickAsync(300);
    scheduleSettle(editorParent, ctx, 'remote');
    await clock.tickAsync(199);
    expect(reloads).to.equal(0);
    await clock.tickAsync(1);
    expect(reloads).to.equal(1);
  });

  it('cancels a scheduled settle when the editor settles right away', async () => {
    const editorParent = mountEditor('<p>Hi</p>');
    scheduleSettle(editorParent, ctx, 'remote');
    await settleEditor(editorParent, ctx);
    await clock.tickAsync(3000);
    expect(reloads).to.equal(1);
  });

  it('leaves editors with a scheduled settle to their own timer', async () => {
    const current = mountEditor('<p>Current</p>');
    const scheduled = mountEditor('<p>Remote</p>');
    scheduled.setAttribute('data-prose-index', '9');
    scheduleSettle(scheduled, ctx, 'remote');
    settleOtherEditors(current, ctx);
    await clock.tickAsync(0);
    expect(scheduled.isConnected).to.equal(true);
    await clock.tickAsync(3000);
    expect(scheduled.isConnected).to.equal(false);
  });

  it('schedules nothing without partialReload', async () => {
    const editorParent = mountEditor('<p>Hi</p>');
    scheduleSettle(editorParent, {}, 'local');
    expect(editorParent.settleTimer).to.equal(undefined);
  });
});
