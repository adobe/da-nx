import { expect } from '@esm-bundle/chai';
import {
  restoreBlockIndices, restoreImageIndices, syncImageIndices, applyImageVersionAck, findTextBlock,
} from '../../../../../nx/public/plugins/quick-edit/src/dom-index.js';

describe('findTextBlock', () => {
  function root(html) {
    const el = document.createElement('div');
    el.innerHTML = html;
    return el;
  }

  it('returns the exact data-prose-index match', () => {
    const r = root('<p data-prose-index="10">a</p><p data-prose-index="20">b</p>');
    expect(findTextBlock(20, r)).to.equal(r.querySelector('[data-prose-index="20"]'));
  });

  it('falls back to the nearest block at-or-before a drifted offset', () => {
    const r = root('<p data-prose-index="10">a</p><p data-prose-index="20">b</p>');
    // 23 has no exact match (positions drifted) — nearest at-or-before is 20.
    expect(findTextBlock(23, r)).to.equal(r.querySelector('[data-prose-index="20"]'));
  });

  it('excludes an already-open editor from an exact match', () => {
    const r = root('<div class="prosemirror-editor" data-prose-index="20">live</div>'
      + '<p data-prose-index="10">a</p>');
    // 20 matches the live editor exactly, but exclude must skip it and fall back to 10.
    expect(findTextBlock(20, r, '.prosemirror-editor')).to.equal(r.querySelector('p'));
  });

  it('excludes an already-open editor from the nearest-block fallback', () => {
    const r = root('<p data-prose-index="10">a</p>'
      + '<div class="prosemirror-editor" data-prose-index="20">live</div>');
    // Nearest at-or-before 23 is the live editor at 20; exclude it and use 10.
    expect(findTextBlock(23, r, '.prosemirror-editor')).to.equal(r.querySelector('p'));
  });
});

describe('restoreBlockIndices', () => {
  it('stamps the authored variant from the source onto the live block', () => {
    const source = document.createElement('div');
    source.innerHTML = '<div class="hero center" data-block-index="2">h</div>';
    const live = document.createElement('div');
    // Live block carries an extra class added by decoration that must be ignored.
    live.innerHTML = '<div class="hero center hero-text-start">h</div>';

    restoreBlockIndices(source, live);

    const block = live.querySelector('.hero');
    expect(block.getAttribute('data-block-index')).to.equal('2');
    expect(block.getAttribute('data-block-variant')).to.equal('center');
  });

  describe('image instrumentation', () => {
    it('restores per-image positions after picture decoration, including duplicate URLs', () => {
      const source = document.createElement('div');
      source.innerHTML = '<main><p data-prose-index="1">'
        + '<img src="/same.png" data-image-index="2" data-image-version="v1">'
        + '<img src="/same.png" data-image-index="3" data-image-version="v1"></p></main>';
      const live = document.createElement('div');
      live.innerHTML = '<main><p data-prose-index="1">'
        + '<picture><img src="/same.png"></picture>'
        + '<picture><img src="/same.png"></picture></p></main>';

      restoreImageIndices(source, live);

      expect([...live.querySelectorAll('img')].map((img) => img.getAttribute('data-image-index')))
        .to.deep.equal(['2', '3']);
      expect([...live.querySelectorAll('img')].map((img) => img.getAttribute('data-image-version')))
        .to.deep.equal(['v1', 'v1']);
    });

    it('does not guess indices when decoration adds an image to a content group', () => {
      const source = document.createElement('div');
      source.innerHTML = '<main><p data-prose-index="1"><img data-image-index="2"></p></main>';
      const live = document.createElement('div');
      live.innerHTML = '<main><p data-prose-index="1"><img><img></p></main>';

      restoreImageIndices(source, live);

      expect(live.querySelector('img[data-image-index]')).to.equal(null);
    });

    it('reindexes an edited image and shifts images following its editable block', () => {
      const root = document.createElement('main');
      root.innerHTML = '<div class="prosemirror-editor" data-image-version="v2"><img data-image-index="106"></div>'
        + '<picture><img data-image-index="110"></picture>';
      document.body.append(root);
      const editorParent = root.querySelector('.prosemirror-editor');
      const inside = editorParent.querySelector('img');
      const after = root.querySelector('picture img');
      const view = {
        dom: editorParent,
        posAtDOM: () => 7,
        state: { doc: { nodeAt: (pos) => (pos === 7 ? { type: { name: 'image' } } : null) } },
      };
      try {
        syncImageIndices(view, editorParent, 101, 10, 3);

        expect(inside.getAttribute('data-image-index')).to.equal('107');
        expect(inside.getAttribute('data-image-version')).to.equal('v2');
        expect(after.getAttribute('data-image-index')).to.equal('113');
      } finally {
        root.remove();
      }
    });

    it('applies the host version acknowledgement without rebuilding the editor', () => {
      const root = document.createElement('main');
      root.innerHTML = '<div class="prosemirror-editor" data-image-version="v1">'
        + '<img data-image-index="2" data-image-version="v1"></div>'
        + '<picture><img data-image-index="5" data-image-version="v1"></picture>';

      const ctx = { pendingNodeUpdateId: 'edit-2' };
      expect(applyImageVersionAck({ imageVersion: 'old', nodeUpdateId: 'edit-1' }, ctx, root)).to.be.false;
      expect(applyImageVersionAck({ imageVersion: 'v2', nodeUpdateId: 'edit-2' }, ctx, root)).to.be.true;

      expect(root.querySelector('.prosemirror-editor').getAttribute('data-image-version')).to.equal('v2');
      expect([...root.querySelectorAll('img')].map((img) => img.getAttribute('data-image-version')))
        .to.deep.equal(['v2', 'v2']);
      expect(ctx.pendingNodeUpdateId).to.equal(null);
      expect(applyImageVersionAck({ imageVersion: 'old', nodeUpdateId: 'edit-2' }, ctx, root)).to.be.false;
      expect(root.querySelector('img').getAttribute('data-image-version')).to.equal('v2');
    });
  });

  it('clears a stale variant attribute when the source block has no variant', () => {
    const source = document.createElement('div');
    source.innerHTML = '<div class="card" data-block-index="3">c</div>';
    const live = document.createElement('div');
    live.innerHTML = '<div class="card" data-block-variant="stale">c</div>';

    restoreBlockIndices(source, live);

    const block = live.querySelector('.card');
    expect(block.getAttribute('data-block-index')).to.equal('3');
    expect(block.hasAttribute('data-block-variant')).to.equal(false);
  });
});
