import { expect } from '@esm-bundle/chai';
import {
  restoreBlockIndices, restoreImageIndices, syncImageIndices, applyImageVersionAck, findTextBlock,
  walkProsePositions, findImageAtProseIndex, setImageVersion,
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

describe('link-image positions', () => {
  const URL_TEXT = 'https://cdn.example.com/assets/hero.jpg';
  const anchor = `<a href="${URL_TEXT}" title="Hero" data-edit-as="image">${URL_TEXT}</a>`;

  const walk = (html, start = 1) => {
    const root = document.createElement('div');
    root.innerHTML = html;
    const events = [];
    const end = walkProsePositions(root, start, {
      onText: (node, pos, len) => events.push(['text', node.textContent, pos, len]),
      onAtomic: (el, pos) => events.push(['atomic', el.tagName.toLowerCase(), pos]),
    });
    return { events, end };
  };

  describe('walkProsePositions', () => {
    it('counts a link-image anchor as one position', () => {
      const { events, end } = walk(`<p>ab${anchor}cd</p>`);
      expect(events).to.deep.equal([
        ['text', 'ab', 1, 2],
        ['atomic', 'a', 3],
        ['text', 'cd', 4, 2],
      ]);
      expect(end).to.equal(6);
    });

    it('does not report the URL text inside a link-image anchor', () => {
      const { events } = walk(`<p>${anchor}</p>`);
      expect(events.filter(([kind]) => kind === 'text')).to.deep.equal([]);
    });

    it('counts consecutive link-images and regular images one position each', () => {
      const { end } = walk(`<p>${anchor}<img src="/a.png">${anchor}</p>`);
      expect(end).to.equal(4);
    });

    it('still counts the text of a regular link by character', () => {
      const { events, end } = walk('<p><a href="/x">link</a></p>');
      expect(events).to.deep.equal([['text', 'link', 1, 4]]);
      expect(end).to.equal(5);
    });
  });

  describe('findImageAtProseIndex', () => {
    it('finds a link-image after text at its one-position offset', () => {
      const root = document.createElement('div');
      root.innerHTML = `<p data-prose-index="1">ab${anchor}cd</p>`;
      const found = findImageAtProseIndex(3, root);
      expect(found && found.tagName).to.equal('A');
      expect(found && found.getAttribute('data-edit-as')).to.equal('image');
    });
  });

  describe('syncImageIndices', () => {
    it('shifts undecorated link-image anchors that follow the edited block', () => {
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
  });

  describe('image version stamping', () => {
    const build = () => {
      const root = document.createElement('main');
      root.innerHTML = '<a data-edit-as="image" data-image-index="2" data-image-version="v1" href="/x.jpg">/x.jpg</a>'
        + '<a data-edit-as="image" href="/y.jpg">/y.jpg</a>'
        + '<a href="/z">plain</a>'
        + '<picture><img data-image-index="5" data-image-version="v1"></picture>';
      return root;
    };

    it('setImageVersion stamps indexed link-image anchors', () => {
      const root = build();
      setImageVersion('v2', root);
      const [indexed, unindexed] = root.querySelectorAll('a[data-edit-as]');
      expect(indexed.getAttribute('data-image-version')).to.equal('v2');
      expect(unindexed.hasAttribute('data-image-version')).to.equal(false);
      expect(root.querySelector('img').getAttribute('data-image-version')).to.equal('v2');
    });

    it('does not stamp regular links', () => {
      const root = build();
      setImageVersion('v2', root);
      expect(root.querySelector('a:not([data-edit-as])').hasAttribute('data-image-version')).to.equal(false);
    });

    it('applyImageVersionAck stamps link-image anchors', () => {
      const root = build();
      const ctx = { pendingNodeUpdateId: 'edit-1' };
      expect(applyImageVersionAck({ imageVersion: 'v3', nodeUpdateId: 'edit-1' }, ctx, root)).to.equal(true);
      expect(root.querySelector('a[data-edit-as][data-image-index]').getAttribute('data-image-version')).to.equal('v3');
    });
  });
});

describe('restoreImageIndices with link-images', () => {
  const restore = (sourceHtml, liveHtml) => {
    const source = document.createElement('div');
    source.innerHTML = sourceHtml;
    const live = document.createElement('div');
    live.innerHTML = liveHtml;
    restoreImageIndices(source, live);
    return live;
  };
  const indexOf = (img) => img.getAttribute('data-image-index');
  const anchor = (index) => `<a href="https://cdn.example.com/x.jpg" data-edit-as="image" data-image-index="${index}">https://cdn.example.com/x.jpg</a>`;

  it('assigns no index when the source scope has a link-image and counts match by coincidence', () => {
    const live = restore(
      `<main><p data-prose-index="1"><img data-image-index="2" data-image-version="v1">${anchor(3)}</p></main>`,
      '<main><p data-prose-index="1"><picture><img src="https://cdn.example.com/x.jpg?w=750"></picture></p></main>',
    );
    const img = live.querySelector('img');
    expect(img.hasAttribute('data-image-index')).to.equal(false);
    expect(img.hasAttribute('data-image-version')).to.equal(false);
  });

  it('skips restore for a block whose source has a link-image', () => {
    const live = restore(
      `<main><div class="cards" data-block-index="5"><div><div><img data-image-index="6">${anchor(7)}</div></div></div></main>`,
      '<main><div class="cards" data-block-index="5"><div><div><picture><img src="/render.jpg"></picture></div></div></div></main>',
    );
    expect(live.querySelector('img').hasAttribute('data-image-index')).to.equal(false);
  });

  it('keeps indices that survived decoration in a link-image scope', () => {
    const live = restore(
      `<main><p data-prose-index="1"><img data-image-index="2" data-image-version="v1">${anchor(3)}</p></main>`,
      '<main><p data-prose-index="1">'
        + '<picture><img src="/a.png" data-image-index="2" data-image-version="v1"></picture>'
        + '<picture><img src="https://cdn.example.com/x.jpg?w=750" data-image-index="3" data-image-version="v1"></picture>'
        + '</p></main>',
    );
    expect([...live.querySelectorAll('img')].map(indexOf)).to.deep.equal(['2', '3']);
    expect([...live.querySelectorAll('img')].map((img) => img.getAttribute('data-image-version')))
      .to.deep.equal(['v1', 'v1']);
  });

  it('does not stamp the link-image picture with the regular image index', () => {
    const live = restore(
      `<main><p data-prose-index="1"><img data-image-index="2">${anchor(3)}</p></main>`,
      '<main><p data-prose-index="1">'
        + '<picture><img src="/a.png" data-image-index="2"></picture>'
        + '<picture><img src="https://cdn.example.com/x.jpg?w=750"></picture>'
        + '</p></main>',
    );
    const [regular, link] = live.querySelectorAll('img');
    expect(indexOf(regular)).to.equal('2');
    expect(link.hasAttribute('data-image-index')).to.equal(false);
  });

  it('still restores by count in a scope without link-images', () => {
    const live = restore(
      '<main><p data-prose-index="1"><img data-image-index="2" data-image-version="v1"></p></main>',
      '<main><p data-prose-index="1"><picture><img src="/a.png"></picture></p></main>',
    );
    const img = live.querySelector('img');
    expect(indexOf(img)).to.equal('2');
    expect(img.getAttribute('data-image-version')).to.equal('v1');
  });

  it('restores a scope without link-images even when a sibling scope has one', () => {
    const live = restore(
      `<main><p data-prose-index="1"><img data-image-index="2">${anchor(3)}</p>`
        + '<p data-prose-index="10"><img data-image-index="11"></p></main>',
      '<main><p data-prose-index="1"><picture><img src="/render.jpg"></picture></p>'
        + '<p data-prose-index="10"><picture><img src="/b.png"></picture></p></main>',
    );
    const [first, second] = live.querySelectorAll('img');
    expect(first.hasAttribute('data-image-index')).to.equal(false);
    expect(indexOf(second)).to.equal('11');
  });

  it('only skips the scope that directly contains the link-image, not its parent block', () => {
    const live = restore(
      '<main><div class="cards" data-block-index="5"><div><div>'
        + `<p data-prose-index="6">${anchor(7)}</p>`
        + '<img data-image-index="8" data-image-version="v1">'
        + '</div></div></div></main>',
      '<main><div class="cards" data-block-index="5"><div><div>'
        + '<p data-prose-index="6"><picture><img src="https://cdn.example.com/x.jpg?w=750"></picture></p>'
        + '<picture><img src="/a.png"></picture>'
        + '</div></div></div></main>',
    );
    const [linkPicture, regular] = live.querySelectorAll('img');
    expect(linkPicture.hasAttribute('data-image-index')).to.equal(false);
    expect(indexOf(regular)).to.equal('8');
    expect(regular.getAttribute('data-image-version')).to.equal('v1');
  });
});
