import { expect } from '@esm-bundle/chai';
import {
  restoreBlockIndices, restoreImageIndices, syncImageIndices, applyImageVersionAck, findTextBlock,
  walkProsePositions, findImageAtProseIndex,
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

    const LINK_SOURCE = '<main><p data-prose-index="1">'
      + '<img data-image-index="2" data-image-version="v1">'
      + '<a href="/x.jpg" data-edit-as="image" data-image-index="3">/x.jpg</a></p></main>';

    function restore(sourceHtml, liveHtml) {
      const source = document.createElement('div');
      source.innerHTML = sourceHtml;
      const live = document.createElement('div');
      live.innerHTML = liveHtml;
      restoreImageIndices(source, live);
      return live;
    }

    it('restores indices for a decorated link-image next to a regular image', () => {
      const live = restore(LINK_SOURCE, '<main><p data-prose-index="1">'
        + '<picture><img src="/a.png"></picture><picture><img src="/x.jpg"></picture></p></main>');

      const imgs = [...live.querySelectorAll('img')];
      expect(imgs.map((img) => img.getAttribute('data-image-index'))).to.deep.equal(['2', '3']);
      expect(imgs.map((img) => img.getAttribute('data-image-version'))).to.deep.equal(['v1', null]);
    });

    it('restores the index for a link-image-only scope after decoration', () => {
      const live = restore(
        '<main><p data-prose-index="1">'
        + '<a href="/x.jpg" data-edit-as="image" data-image-index="2">/x.jpg</a></p></main>',
        '<main><p data-prose-index="1"><picture><img src="/x.jpg"></picture></p></main>',
      );

      expect(live.querySelector('img').getAttribute('data-image-index')).to.equal('2');
    });

    it('keeps link-images as links and indexes only the regular images', () => {
      const live = restore(LINK_SOURCE, '<main><p data-prose-index="1">'
        + '<picture><img src="/a.png"></picture>'
        + '<a href="/x.jpg" data-edit-as="image" data-image-index="3">/x.jpg</a></p></main>');

      const img = live.querySelector('img');
      expect(img.getAttribute('data-image-index')).to.equal('2');
      expect(img.getAttribute('data-image-version')).to.equal('v1');
      expect(live.querySelector('a').getAttribute('data-image-index')).to.equal('3');
    });

    it('does not guess indices when link-image scope counts do not match', () => {
      const live = restore(LINK_SOURCE, '<main><p data-prose-index="1">'
        + '<img><img><img></p></main>');

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

    it('shifts link-image indices that follow the edited block', () => {
      const root = document.createElement('main');
      root.innerHTML = '<a data-edit-as="image" data-image-index="100" href="/w.jpg">/w.jpg</a>'
        + '<div class="prosemirror-editor"><img data-image-index="106"></div>'
        + '<a data-edit-as="image" data-image-index="110" href="/x.jpg">/x.jpg</a>';
      document.body.append(root);
      const editorParent = root.querySelector('.prosemirror-editor');
      const [before, after] = root.querySelectorAll('a');
      const view = {
        dom: editorParent,
        posAtDOM: () => 7,
        state: { doc: { nodeAt: () => ({ type: { name: 'image' } }) } },
      };
      try {
        syncImageIndices(view, editorParent, 101, 10, 3);

        expect(before.getAttribute('data-image-index')).to.equal('100');
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

  it('only re-attaches indices to blocks that lost theirs', () => {
    const source = document.createElement('div');
    source.innerHTML = '<div class="cards" data-block-index="10">a</div>'
      + '<div class="cards" data-block-index="30">b</div>';
    const live = document.createElement('div');
    live.innerHTML = '<div class="cards" data-block-index="30">b</div><div class="cards">a</div>';

    restoreBlockIndices(source, live);

    expect([...live.querySelectorAll('.cards')].map((el) => [el.textContent, el.dataset.blockIndex]))
      .to.deep.equal([['b', '30'], ['a', '10']]);
  });
});

describe('link-image prose positions', () => {
  const URL_HREF = 'https://x.test/a.jpg';

  function walk(html) {
    const root = document.createElement('div');
    root.innerHTML = html;
    const calls = [];
    const end = walkProsePositions(root.firstElementChild, 1, {
      onText: (node, pos) => calls.push(['text', node.textContent, pos]),
      onAtomic: (el, pos) => calls.push(['atomic', el.tagName, pos]),
    });
    return { calls, end };
  }

  it('counts a link-image as one atomic position', () => {
    const { calls, end } = walk(`<p>Hi <a data-edit-as="image" href="${URL_HREF}">${URL_HREF}</a> there</p>`);

    expect(calls).to.deep.equal([['text', 'Hi ', 1], ['atomic', 'A', 4], ['text', ' there', 5]]);
    expect(end).to.equal(11);
  });

  it('resolves a link-image by prose index', () => {
    const root = document.createElement('div');
    root.innerHTML = `<main><p data-prose-index="1">Hi <a data-edit-as="image" href="${URL_HREF}">${URL_HREF}</a> there</p></main>`;

    expect(findImageAtProseIndex(4, root) === root.querySelector('a')).to.equal(true);
  });

  it('still walks a plain link as text', () => {
    const { calls, end } = walk('<p>Hi <a href="/y">link</a> there</p>');

    expect(calls).to.deep.equal([['text', 'Hi ', 1], ['text', 'link', 4], ['text', ' there', 8]]);
    expect(end).to.equal(14);
  });
});
