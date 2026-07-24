import { expect } from '@esm-bundle/chai';
import {
  findTextBlock,
  findBlock,
  findImageAtProseIndex,
  restoreBlockIndices,
} from '../../../../../nx/public/plugins/quick-edit/src/dom-index.js';
import {
  findBlockForMarker,
  mapProseRangeToDomRange,
  adjustTextHighlightRect,
  scrollToProseIndex,
  setCommentMarkers,
  applyCommentMarkers,
  sortMarkersForRender,
} from '../../../../../nx/public/plugins/quick-edit/src/comments.js';

function buildBody() {
  document.body.innerHTML = `
    <main>
      <p data-prose-index="1">first block</p>
      <p data-prose-index="21">before <picture><img src="/img.png" alt=""></picture> after</p>
      <div class="cards" data-block-index="50">table block</div>
    </main>`;
}

// Marker placement derives from the bubble's real rendered diameter, so load the
// production stylesheet before asserting coordinates.
function loadQuickEditCss() {
  return new Promise((resolve, reject) => {
    if (document.getElementById('qe-css-under-test')) {
      resolve();
      return;
    }
    const link = document.createElement('link');
    link.id = 'qe-css-under-test';
    link.rel = 'stylesheet';
    link.href = '/nx/public/plugins/quick-edit/quick-edit.css';
    link.onload = resolve;
    link.onerror = reject;
    document.head.appendChild(link);
  });
}

describe('quick-edit comments', () => {
  beforeEach(buildBody);
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('findTextBlock picks the closest block at or before pos', () => {
    expect(findTextBlock(1).textContent).to.equal('first block');
    expect(findTextBlock(25).textContent.trim()).to.match(/before/);
    expect(findTextBlock(999).textContent.trim()).to.match(/after/);
    expect(findTextBlock(0)).to.equal(null);
  });

  it('findBlock resolves exact and nearest block indices', () => {
    expect(findBlock(50).classList.contains('cards')).to.equal(true);
    expect(findBlock(55).classList.contains('cards')).to.equal(true);
    expect(findBlock(0)).to.equal(null);
  });

  it('mapProseRangeToDomRange maps PM offsets to a DOM range', () => {
    const block = findTextBlock(21);
    const range = mapProseRangeToDomRange(block, 21, 21, 27);
    expect(range).to.not.equal(null);
    expect(range.toString()).to.equal('before');
  });

  it('mapProseRangeToDomRange selects the full anchored text span', () => {
    document.body.innerHTML = '<p data-prose-index="21">before edasdasdasnim after</p>';
    const block = findTextBlock(28);
    const range = mapProseRangeToDomRange(block, 21, 28, 41);
    expect(range?.toString()).to.equal('edasdasdasnim');
  });

  it('mapProseRangeToDomRange resolves by exact PM offset, not by matching text', () => {
    // The same word appears twice; resolution must use the position [from, to),
    // never search for the text (which would be ambiguous between instances).
    document.body.innerHTML = '<p data-prose-index="21">foo bar foo baz</p>';
    const block = findTextBlock(21);
    const first = mapProseRangeToDomRange(block, 21, 21, 24);
    const second = mapProseRangeToDomRange(block, 21, 29, 32);
    expect(first?.toString()).to.equal('foo');
    expect(second?.toString()).to.equal('foo');
    // Distinct DOM ranges at the two different offsets.
    expect(first.startOffset).to.equal(0);
    expect(second.startOffset).to.equal(8);
  });

  it('mapProseRangeToDomRange handles an atomic inline image', () => {
    const block = findTextBlock(21);
    const range = mapProseRangeToDomRange(block, 21, 28, 29);
    expect(range).to.not.equal(null);
    expect(range.intersectsNode(block.querySelector('picture'))).to.equal(true);
  });

  it('adjustTextHighlightRect nudges highlights down onto the text body', () => {
    const adjusted = adjustTextHighlightRect({ left: 0, top: 10, width: 50, height: 24 });
    expect(adjusted.top).to.be.greaterThan(10);
    expect(adjusted.height).to.be.lessThan(24);
  });

  it('findBlockForMarker resolves by anchorText block name', () => {
    document.body.innerHTML = '<main><div class="columns">block content</div></main>';
    const block = findBlockForMarker({
      from: 999,
      to: 1000,
      anchorText: 'block: columns',
    });
    expect(block?.classList.contains('columns')).to.equal(true);
  });

  it('restoreBlockIndices re-applies data-block-index after DOM rebuild', () => {
    const source = new DOMParser().parseFromString(
      '<main><div class="columns" data-block-index="50">cols</div></main>',
      'text/html',
    );
    document.body.innerHTML = '<main><div class="columns">cols</div></main>';
    restoreBlockIndices(source, document);
    expect(document.querySelector('.columns').getAttribute('data-block-index')).to.equal('50');
  });

  it('restoreBlockIndices maps duplicate block types to their indices in order', () => {
    const source = new DOMParser().parseFromString(
      '<main><div class="columns" data-block-index="50">A</div><div class="columns" data-block-index="120">B</div></main>',
      'text/html',
    );
    document.body.innerHTML = '<main><div class="columns">A</div><div class="columns">B</div></main>';
    restoreBlockIndices(source, document);
    const blocks = [...document.querySelectorAll('.columns')];
    expect(blocks[0].getAttribute('data-block-index')).to.equal('50');
    expect(blocks[1].getAttribute('data-block-index')).to.equal('120');
  });

  it('findBlockForMarker resolves duplicate blocks by their in-range index (content-start = from + 1)', () => {
    // A block node spans [from, to); getInstrumentedHTML stamps data-block-index
    // as posAtDOM(node, 0) === from + 1. Resolution must match by range so that
    // two identical blocks each resolve to their own instance.
    document.body.innerHTML = `<main>
      <div class="columns" data-block-index="51">A</div>
      <div class="columns" data-block-index="121">B</div>
    </main>`;
    const first = findBlockForMarker({ from: 50, to: 60, anchorText: 'block: columns' });
    const second = findBlockForMarker({ from: 120, to: 130, anchorText: 'block: columns' });
    expect(first.textContent.trim()).to.equal('A');
    expect(second.textContent.trim()).to.equal('B');
  });

  it('findBlockForMarker picks the outermost block when blocks are nested', () => {
    document.body.innerHTML = `<main>
      <div class="columns" data-block-index="51">
        <div class="cards" data-block-index="55">inner</div>
      </div>
    </main>`;
    const outer = findBlockForMarker({ from: 50, to: 90, anchorText: 'block: columns' });
    const inner = findBlockForMarker({ from: 54, to: 60, anchorText: 'block: cards' });
    expect(outer.classList.contains('columns')).to.equal(true);
    expect(inner.classList.contains('cards')).to.equal(true);
  });

  it('findBlockForMarker never guesses between duplicate un-instrumented blocks', () => {
    // No data-block-index present: marking the wrong duplicate is worse than
    // drawing nothing, so resolution returns null rather than the first match.
    document.body.innerHTML = '<main><div class="columns">A</div><div class="columns">B</div></main>';
    const block = findBlockForMarker({ from: 50, to: 60, anchorText: 'block: columns' });
    expect(block).to.equal(null);
  });

  it('findBlockForMarker does not throw on a block name that is an invalid CSS selector', () => {
    document.body.innerHTML = '<main><div class="2col">x</div></main>';
    let block;
    expect(() => {
      block = findBlockForMarker({ from: 999, to: 1000, anchorText: 'block: 2col' });
    }).to.not.throw();
    expect(block?.classList.contains('2col')).to.equal(true);
  });

  it('a marker with an invalid block name does not block other markers from rendering', () => {
    document.body.innerHTML = `
      <main>
        <div class="2col">x</div>
        <p data-prose-index="21">before after</p>
      </main>`;
    const ctx = { port: { postMessage() {} } };
    setCommentMarkers({
      markers: [
        { threadId: 'bad', anchorType: 'table', from: 5, to: 6, anchorText: 'block: 2col' },
        { threadId: 'txt', anchorType: 'text', from: 21, to: 27, anchorText: 'before' },
      ],
    }, ctx);
    expect(document.querySelectorAll('.qe-comment-box-text')).to.have.lengthOf(1);
  });

  it('text highlights are non-interactive so the underlying text stays editable', () => {
    const posted = [];
    const ctx = { port: { postMessage: (m) => posted.push(m) }, selectedThreadId: 't2' };
    setCommentMarkers({
      markers: [{ threadId: 't2', anchorType: 'text', from: 21, to: 27, anchorText: 'before' }],
      selectedThreadId: 't2',
    }, ctx);
    const box = document.querySelector('.qe-comment-box-text');
    expect(box.tagName).to.equal('DIV');
    // A direct click on the box must not steal the event from the editor.
    box.click();
    expect(posted).to.have.lengthOf(0);
  });

  it('clicking commented text hit-tests the highlight and opens the thread', () => {
    const posted = [];
    const ctx = { port: { postMessage: (m) => posted.push(m) } };
    setCommentMarkers({
      markers: [{ threadId: 't2', anchorType: 'text', from: 21, to: 27, anchorText: 'before' }],
      selectedThreadId: 't2',
    }, ctx);
    const r = document.querySelector('.qe-comment-box-text').getBoundingClientRect();
    document.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: Math.floor(r.left + (r.width / 2)),
      clientY: Math.floor(r.top + (r.height / 2)),
    }));
    expect(posted[0]).to.deep.equal({ type: 'comment-marker-click', threadId: 't2' });
  });

  it('setCommentMarkers clears markers when given an empty list', () => {
    const ctx = { port: { postMessage() {} } };
    setCommentMarkers({
      markers: [{ threadId: 't2', anchorType: 'text', from: 21, to: 27, anchorText: 'before' }],
    }, ctx);
    setCommentMarkers({ markers: [] }, ctx);
    expect(document.querySelectorAll('.qe-comment-bubble')).to.have.lengthOf(0);
  });

  it('draws a top-right block bubble and a centered image bubble sized to the CSS', async () => {
    await loadQuickEditCss();
    const block = document.querySelector('.cards');
    const picture = document.querySelector('picture');
    block.getBoundingClientRect = () => ({
      left: 50, top: 100, width: 200, height: 300, right: 250, bottom: 400,
    });
    picture.getBoundingClientRect = () => ({
      left: 100, top: 200, width: 80, height: 60, right: 180, bottom: 260,
    });
    const ctx = { port: { postMessage() {} } };
    setCommentMarkers({
      markers: [
        { threadId: 'img1', anchorType: 'image', from: 28, to: 29, anchorText: '' },
        { threadId: 'tbl1', anchorType: 'table', from: 50, to: 51, anchorText: 'block: cards' },
      ],
      selectedThreadId: null,
    }, ctx);
    const [blockMarker, imageMarker] = [...document.querySelectorAll('.qe-comment-bubble')];
    expect(blockMarker.dataset.commentThread).to.equal('tbl1');
    expect(imageMarker.dataset.commentThread).to.equal('img1');
    expect(blockMarker.classList.contains('is-top-right')).to.equal(true);
    // Placement tracks the rendered diameter (whatever the CSS sets it to).
    const size = blockMarker.getBoundingClientRect().width;
    expect(size).to.be.greaterThan(0);
    expect(parseFloat(blockMarker.style.left)).to.equal(250 - size);
    expect(parseFloat(blockMarker.style.top)).to.equal(100);
    expect(parseFloat(imageMarker.style.left)).to.equal((100 + 40) - (size / 2));
    expect(parseFloat(imageMarker.style.top)).to.equal((200 + 30) - (size / 2));
    // Outlines only render on selection; nothing is selected here.
    expect(document.querySelectorAll('.qe-comment-box-anchor-block')).to.have.lengthOf(0);
  });

  it('outlines only the selected block, not the other commented one', () => {
    const ctx = { port: { postMessage() {} }, selectedThreadId: 'tbl1' };
    setCommentMarkers({
      markers: [
        { threadId: 'img1', anchorType: 'image', from: 28, to: 29, anchorText: '' },
        { threadId: 'tbl1', anchorType: 'table', from: 50, to: 51, anchorText: 'block: cards' },
      ],
      selectedThreadId: 'tbl1',
    }, ctx);
    // Only the selected thread draws an outline; the other commented block does not.
    const outlines = [...document.querySelectorAll('.qe-comment-box-anchor-block')];
    expect(outlines).to.have.lengthOf(1);
    // Both still show their bubbles at rest.
    expect(document.querySelectorAll('.qe-comment-bubble')).to.have.lengthOf(2);
    expect(document.querySelector('.qe-comment-bubble.is-active').dataset.commentThread).to.equal('tbl1');
  });

  it('selected image uses the shared block outline in its active state', () => {
    const ctx = { port: { postMessage() {} }, selectedThreadId: 'img1' };
    setCommentMarkers({
      markers: [
        { threadId: 'img1', anchorType: 'image', from: 28, to: 29, anchorText: '' },
      ],
      selectedThreadId: 'img1',
    }, ctx);
    expect(document.querySelectorAll('.qe-comment-box-anchor-block')).to.have.lengthOf(1);
    expect(document.querySelector('.qe-comment-box-anchor-block').classList.contains('is-active')).to.equal(true);
    expect(document.querySelector('.qe-comment-bubble.is-active').dataset.commentThread).to.equal('img1');
  });

  it('block and image markers open their thread when clicked', () => {
    const posted = [];
    const ctx = { port: { postMessage: (m) => posted.push(m) }, selectedThreadId: null };
    setCommentMarkers({
      markers: [{ threadId: 'tbl1', anchorType: 'table', from: 50, to: 51, anchorText: 'block: cards' }],
    }, ctx);
    document.querySelector('.qe-comment-bubble').click();
    expect(posted[0]).to.deep.equal({ type: 'comment-marker-click', threadId: 'tbl1' });
  });

  it('bubbles carry the author initials and color; the selected outline is author-tinted', () => {
    const block = document.querySelector('.cards');
    block.getBoundingClientRect = () => ({
      left: 50, top: 100, width: 200, height: 300, right: 250, bottom: 400,
    });
    const ctx = { port: { postMessage() {} }, selectedThreadId: 'tbl1' };
    setCommentMarkers({
      markers: [{
        threadId: 'tbl1',
        anchorType: 'table',
        from: 50,
        to: 51,
        anchorText: 'block: cards',
        color: '#3366cc',
        highlightColor: '#3366cc',
        initials: 'AB',
      }],
      selectedThreadId: 'tbl1',
    }, ctx);
    const bubble = document.querySelector('.qe-comment-bubble');
    expect(bubble.textContent).to.equal('AB');
    expect(bubble.style.getPropertyValue('--da-comment-color')).to.equal('#3366cc');
    // Outline is only present because the thread is selected.
    const outline = document.querySelector('.qe-comment-box-anchor-block');
    expect(outline.classList.contains('is-authored')).to.equal(true);
    expect(outline.style.getPropertyValue('--da-comment-color')).to.equal('#3366cc');
  });

  it('uses highlightColor for the box/outline and textColor for the bubble initials', () => {
    const ctx = { port: { postMessage() {} } };
    setCommentMarkers({
      markers: [{
        threadId: 't3',
        anchorType: 'text',
        from: 21,
        to: 27,
        anchorText: 'before',
        color: '#accffd',
        textColor: '#10288c',
        highlightColor: '#5d89ff',
        initials: 'EF',
      }],
    }, ctx);
    const box = document.querySelector('.qe-comment-box-text');
    // Highlight fill/border comes from the strong (700) color, not the bubble bg.
    expect(box.style.getPropertyValue('--da-comment-color')).to.equal('#5d89ff');
    const bubble = document.querySelector('.qe-comment-bubble');
    expect(bubble.style.getPropertyValue('--da-comment-color')).to.equal('#accffd');
    expect(bubble.style.color).to.equal('rgb(16, 40, 140)');
  });

  it('text comments get an author-colored highlight box plus an initials bubble', () => {
    const ctx = { port: { postMessage() {} } };
    setCommentMarkers({
      markers: [{
        threadId: 't2',
        anchorType: 'text',
        from: 21,
        to: 27,
        anchorText: 'before',
        color: '#aa2211',
        highlightColor: '#aa2211',
        initials: 'CD',
      }],
    }, ctx);
    const box = document.querySelector('.qe-comment-box-text');
    expect(box.classList.contains('is-authored')).to.equal(true);
    expect(box.style.getPropertyValue('--da-comment-color')).to.equal('#aa2211');
    const bubble = document.querySelector('.qe-comment-bubble');
    expect(bubble.textContent).to.equal('CD');
    expect(bubble.dataset.commentThread).to.equal('t2');
  });

  it('nested text comments are hit-testable inside a commented block', () => {
    document.body.innerHTML = `
      <main>
        <div class="columns" data-block-index="51">
          <p data-prose-index="51">inner text here</p>
        </div>
      </main>`;
    const posted = [];
    const ctx = { port: { postMessage: (m) => posted.push(m) }, selectedThreadId: null };
    setCommentMarkers({
      markers: [
        { threadId: 'blk', anchorType: 'table', from: 50, to: 80, anchorText: 'block: columns' },
        { threadId: 'txt', anchorType: 'text', from: 51, to: 56, anchorText: 'inner' },
      ],
    }, ctx);
    // The block and the nested text comment each draw an initials bubble; the
    // text highlight box itself stays non-interactive and is resolved by
    // hit-testing when its rects (not the bubble) are clicked.
    expect(document.querySelectorAll('.qe-comment-bubble')).to.have.lengthOf(2);
    const r = document.querySelector('.qe-comment-box-text').getBoundingClientRect();
    document.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: Math.floor(r.left + (r.width / 2)),
      clientY: Math.floor(r.top + (r.height / 2)),
    }));
    expect(posted[0]).to.deep.equal({ type: 'comment-marker-click', threadId: 'txt' });
  });

  it('sortMarkersForRender draws block markers before nested anchors', () => {
    const sorted = sortMarkersForRender([
      { anchorType: 'text', threadId: 'a' },
      { anchorType: 'table', threadId: 'b' },
      { anchorType: 'image', threadId: 'c' },
    ]);
    expect(sorted.map((m) => m.threadId)).to.deep.equal(['b', 'c', 'a']);
  });

  it('findPictureForImageMarker resolves by imageSrc when prose index was stripped', () => {
    document.body.innerHTML = `
      <main>
        <div class="cards" data-block-index="51">
          <picture><img src="/myorg/mysite/media/card-a.png" alt=""></picture>
          <h3 data-prose-index="56">Title</h3>
        </div>
      </main>`;
    const img = document.querySelector('img');
    img.getBoundingClientRect = () => ({
      left: 120, top: 220, width: 80, height: 60, right: 200, bottom: 280,
    });
    const ctx = { port: { postMessage() {} } };
    setCommentMarkers({
      markers: [{
        threadId: 'card-img',
        anchorType: 'image',
        from: 51,
        to: 52,
        anchorText: '',
        imageSrc: 'https://content.da.live/myorg/mysite/media/card-a.png',
      }],
    }, ctx);
    expect(document.querySelector('.qe-comment-bubble')?.dataset.commentThread).to.equal('card-img');
  });

  it('findImageAtProseIndex resolves images inside an editable block', () => {
    document.body.innerHTML = `
      <main>
        <p data-prose-index="21">before <picture><img src="/img.png" alt="" width="80" height="60"></picture> after</p>
      </main>`;
    expect(findImageAtProseIndex(28)?.tagName).to.equal('PICTURE');
  });

  it('findImageAtProseIndex resolves image-only picture blocks', () => {
    document.body.innerHTML = '<main><picture data-prose-index="40"><img src="/solo.png" alt=""></picture></main>';
    const ctx = { port: { postMessage() {} } };
    setCommentMarkers({
      markers: [{ threadId: 'solo', anchorType: 'image', from: 40, to: 41, anchorText: '' }],
    }, ctx);
    expect(document.querySelectorAll('.qe-comment-bubble')).to.have.lengthOf(1);
  });

  it('re-applying markers clears the previous set', () => {
    const ctx = { port: { postMessage() {} } };
    setCommentMarkers({
      markers: [{ threadId: 't2', anchorType: 'text', from: 21, to: 27, anchorText: 'before' }],
    }, ctx);
    setCommentMarkers({
      markers: [{ threadId: 'tbl1', anchorType: 'table', from: 50, to: 51, anchorText: '' }],
    }, ctx);
    expect(document.querySelectorAll('.qe-comment-bubble')).to.have.lengthOf(1);
    // Previous text set is cleared; the new table shows just its bubble (no
    // outline, since nothing is selected).
    expect(document.querySelectorAll('.qe-comment-box-text')).to.have.lengthOf(0);
    expect(document.querySelectorAll('.qe-comment-box-anchor-block')).to.have.lengthOf(0);
  });

  it('scrollToProseIndex scrolls the matching block into view', () => {
    let scrolled = null;
    const block = findTextBlock(25);
    block.scrollIntoView = () => { scrolled = block; };
    scrollToProseIndex(25);
    expect(scrolled).to.equal(block);
  });

  it('clicking outside an active highlight clears selection via comment-marker-clear', () => {
    const posted = [];
    const ctx = {
      port: { postMessage: (m) => posted.push(m) },
      selectedThreadId: 't2',
      commentMarkers: [{ threadId: 't2', anchorType: 'text', from: 21, to: 27, anchorText: 'before' }],
    };
    applyCommentMarkers(ctx);
    document.body.click();
    expect(posted).to.deep.equal([{ type: 'comment-marker-clear' }]);
  });

  it('setCommentMarkers clears selectedThreadId when parent sends null', () => {
    const ctx = { port: { postMessage() {} }, selectedThreadId: 't2' };
    setCommentMarkers({
      markers: [{ threadId: 't2', anchorType: 'text', from: 21, to: 27, anchorText: 'before' }],
      selectedThreadId: null,
    }, ctx);
    expect(ctx.selectedThreadId).to.equal(null);
    expect(document.querySelector('.qe-comment-box-text.is-active')).to.equal(null);
  });
});
