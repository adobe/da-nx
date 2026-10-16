import { expect } from '@esm-bundle/chai';
import {
  setFindingMarkers,
  applyFindingMarkers,
} from '../../../../../nx/public/plugins/quick-edit/src/findings/index.js';
import { setCommentMarkers } from '../../../../../nx/public/plugins/quick-edit/src/comments/index.js';

const rectOf = (left, top, width, height) => ({
  left, top, width, height, right: left + width, bottom: top + height,
});

const nextFrame = () => new Promise((resolve) => { requestAnimationFrame(() => resolve()); });

function buildBody() {
  document.body.innerHTML = `
    <main>
      <h1 data-prose-index="1">Born from a passion</h1>
      <p data-prose-index="30">paragraph text</p>
      <div class="hero" data-block-index="60"><picture data-prose-index="70"><img src="/media_abc.png" alt=""></picture></div>
      <div class="cards" data-block-index="90">table block</div>
    </main>`;
}

function setup() {
  const posted = [];
  const ctx = { port: { postMessage: (m) => posted.push(m) } };
  const h1 = document.querySelector('h1');
  h1.getBoundingClientRect = () => rectOf(20, 40, 300, 50);
  return { posted, ctx, h1 };
}

const textMarker = { id: 'f1', anchorType: 'text', from: 1, to: 10 };
const layouts = (posted) => posted.filter((m) => m.type === 'finding-marker-layout');
const clicks = (posted) => posted.filter((m) => m.type === 'finding-marker-click');

describe('quick-edit findings', () => {
  beforeEach(buildBody);
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('outlines the block element containing a text marker with a badge and info button', () => {
    const { ctx } = setup();
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1' }, ctx);
    const overlay = document.getElementById('qe-finding-overlay');
    expect(overlay.className).to.equal('qe-finding-overlay');
    const box = overlay.querySelector('.qe-finding-box');
    expect(box.style.left).to.equal('20px');
    expect(box.style.top).to.equal('40px');
    expect(box.style.width).to.equal('300px');
    expect(box.style.height).to.equal('50px');
    expect(overlay.querySelector('.qe-finding-badge svg')).to.not.equal(null);
    expect(overlay.querySelector('.qe-finding-info')).to.not.equal(null);
    expect(overlay.querySelectorAll('.qe-finding-edge')).to.have.lengthOf(4);
  });

  it('places the badge top-left and the info button top-right, 2.4px above the 4.8px outline', () => {
    const { ctx } = setup();
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1' }, ctx);
    const badge = document.querySelector('.qe-finding-badge');
    const info = document.querySelector('.qe-finding-info');
    const top = 40 - 4.8 - 2.4 - 28.8;
    expect(parseFloat(badge.style.left)).to.be.closeTo(20 - 4.8, 0.01);
    expect(parseFloat(badge.style.top)).to.be.closeTo(top, 0.01);
    expect(parseFloat(info.style.left)).to.be.closeTo(20 + 300 + 4.8 - 28.8, 0.01);
    expect(parseFloat(info.style.top)).to.be.closeTo(top, 0.01);
    [badge, info].forEach((el) => {
      const svg = el.querySelector('svg');
      expect(svg.getAttribute('viewBox')).to.equal('0 0 20 20');
      expect(svg.getAttribute('width')).to.equal('19.2');
    });
  });

  it('keeps the buttons inside the viewport when the element is at the top edge', () => {
    const { ctx, h1 } = setup();
    h1.getBoundingClientRect = () => rectOf(20, 0, 300, 50);
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1' }, ctx);
    expect(parseFloat(document.querySelector('.qe-finding-badge').style.top)).to.equal(2);
  });

  it('shows the marker badge text instead of the icon when badge is a string', () => {
    const { ctx } = setup();
    setFindingMarkers({ markers: [{ ...textMarker, badge: 'B' }], selectedId: 'f1' }, ctx);
    const badge = document.querySelector('.qe-finding-badge');
    expect(badge.textContent).to.equal('B');
    expect(badge.querySelector('svg')).to.equal(null);
  });

  it('outlines the picture for an image marker', () => {
    const { ctx } = setup();
    const img = document.querySelector('picture img');
    img.getBoundingClientRect = () => rectOf(100, 200, 80, 60);
    setFindingMarkers({
      markers: [{ id: 'i1', anchorType: 'image', from: 70, to: 71 }],
      selectedId: 'i1',
    }, ctx);
    const box = document.querySelector('.qe-finding-box');
    expect(box.style.left).to.equal('100px');
    expect(box.style.top).to.equal('200px');
    expect(box.style.width).to.equal('80px');
    expect(box.style.height).to.equal('60px');
  });

  it('outlines the block for a table marker', () => {
    const { ctx } = setup();
    document.querySelector('.cards').getBoundingClientRect = () => rectOf(5, 300, 400, 120);
    setFindingMarkers({
      markers: [{ id: 't1', anchorType: 'table', from: 89, to: 95 }],
      selectedId: 't1',
    }, ctx);
    const box = document.querySelector('.qe-finding-box');
    expect(box.style.top).to.equal('300px');
    expect(box.style.height).to.equal('120px');
  });

  it('draws only the selected marker', () => {
    const { ctx } = setup();
    setFindingMarkers({
      markers: [textMarker, { id: 'f2', anchorType: 'text', from: 30, to: 35 }],
      selectedId: 'f2',
    }, ctx);
    const boxes = document.querySelectorAll('.qe-finding-box');
    expect(boxes).to.have.lengthOf(1);
    expect(boxes[0].dataset.findingId).to.equal('f2');

    setFindingMarkers({ markers: [textMarker], selectedId: null }, ctx);
    expect(document.querySelectorAll('.qe-finding-box')).to.have.lengthOf(0);
  });

  it('clears the overlay when given an empty list', () => {
    const { ctx } = setup();
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1' }, ctx);
    expect(document.querySelectorAll('.qe-finding-box')).to.have.lengthOf(1);
    setFindingMarkers({ markers: [], selectedId: null }, ctx);
    expect(document.getElementById('qe-finding-overlay').children).to.have.lengthOf(0);
  });

  it('keeps the outline body non-interactive', async () => {
    const { ctx } = setup();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/nx/public/plugins/quick-edit/quick-edit.css';
    await new Promise((resolve, reject) => {
      link.onload = resolve;
      link.onerror = reject;
      document.head.appendChild(link);
    });
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1' }, ctx);
    const style = (sel) => getComputedStyle(document.querySelector(sel)).pointerEvents;
    const zIndex = Number(getComputedStyle(document.querySelector('.qe-finding-overlay')).zIndex);
    expect(zIndex).to.be.greaterThan(9998);
    expect(style('.qe-finding-overlay')).to.equal('none');
    expect(style('.qe-finding-box')).to.equal('none');
    expect(style('.qe-finding-badge')).to.equal('auto');
    expect(style('.qe-finding-info')).to.equal('auto');
    expect(style('.qe-finding-edge')).to.equal('auto');
    link.remove();
  });

  it('styles the failure highlight per the design (3px orange ring outside a 1.8px white ring, orange badge, dark info)', async () => {
    const { ctx } = setup();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/nx/public/plugins/quick-edit/quick-edit.css';
    await new Promise((resolve, reject) => {
      link.onload = resolve;
      link.onerror = reject;
      document.head.appendChild(link);
    });
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1' }, ctx);
    const cs = (sel) => getComputedStyle(document.querySelector(sel));
    const box = cs('.qe-finding-box');
    expect(box.boxShadow).to.equal(
      'rgb(255, 255, 255) 0px 0px 0px 1.8px, rgb(252, 125, 0) 0px 0px 0px 4.8px',
    );
    expect(box.borderRadius).to.equal('2.4px');
    expect(box.filter).to.equal('none');
    const badge = cs('.qe-finding-badge');
    expect(parseFloat(badge.width)).to.be.closeTo(28.8, 0.05);
    expect(parseFloat(badge.height)).to.be.closeTo(28.8, 0.05);
    expect(badge.borderRadius).to.equal('8.4px');
    expect(badge.backgroundColor).to.equal('rgb(252, 125, 0)');
    expect(badge.color).to.equal('rgb(255, 255, 255)');
    const info = cs('.qe-finding-info');
    expect(parseFloat(info.width)).to.be.closeTo(28.8, 0.05);
    expect(info.borderRadius).to.equal('8.4px');
    expect(info.backgroundColor).to.equal('rgb(19, 19, 19)');
    expect(info.color).to.equal('rgb(255, 255, 255)');
    link.remove();
  });

  it('posts FINDING_MARKER_CLICK when the badge, info button or border is clicked', () => {
    const { ctx, posted } = setup();
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1' }, ctx);
    document.querySelector('.qe-finding-badge').click();
    document.querySelector('.qe-finding-info').click();
    document.querySelector('.qe-finding-edge-top').click();
    expect(clicks(posted)).to.have.lengthOf(3);
    clicks(posted).forEach((m) => expect(m.payload).to.deep.equal({ id: 'f1' }));
  });

  it('posts FINDING_MARKER_LAYOUT with the rounded element rect', () => {
    const { ctx, posted, h1 } = setup();
    h1.getBoundingClientRect = () => rectOf(20.4, 40.6, 300.2, 49.5);
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1' }, ctx);
    expect(layouts(posted)).to.deep.equal([{
      type: 'finding-marker-layout',
      payload: { id: 'f1', rect: { top: 41, left: 20, width: 300, height: 50 } },
    }]);
  });

  it('posts a null rect when the element cannot be found', () => {
    const { ctx, posted } = setup();
    document.body.innerHTML = '<main><p>no indexed blocks</p></main>';
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1' }, ctx);
    expect(layouts(posted)).to.deep.equal([{
      type: 'finding-marker-layout',
      payload: { id: 'f1', rect: null },
    }]);
    expect(document.querySelectorAll('.qe-finding-box')).to.have.lengthOf(0);
  });

  it('does not repost an unchanged layout on re-render, but reposts when the rect or id changes', async () => {
    const { ctx, posted, h1 } = setup();
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1' }, ctx);
    applyFindingMarkers(ctx);
    window.dispatchEvent(new Event('resize'));
    await nextFrame();
    await nextFrame();
    expect(layouts(posted)).to.have.lengthOf(1);

    h1.getBoundingClientRect = () => rectOf(20, 100, 300, 50);
    window.dispatchEvent(new Event('resize'));
    await nextFrame();
    await nextFrame();
    expect(layouts(posted)).to.have.lengthOf(2);
    expect(layouts(posted)[1].payload.rect.top).to.equal(100);

    setFindingMarkers({
      markers: [textMarker, { id: 'f2', anchorType: 'text', from: 30, to: 35 }],
      selectedId: 'f2',
    }, ctx);
    expect(layouts(posted)).to.have.lengthOf(3);
    expect(layouts(posted)[2].payload.id).to.equal('f2');
  });

  it('reposts layout for every incoming SET_FINDING_MARKERS, even if unchanged', () => {
    const { ctx, posted } = setup();
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1' }, ctx);
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1' }, ctx);
    expect(layouts(posted)).to.have.lengthOf(2);
    expect(layouts(posted)[1]).to.deep.equal(layouts(posted)[0]);
  });

  it('reports layout again after being cleared and re-set', () => {
    const { ctx, posted } = setup();
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1' }, ctx);
    setFindingMarkers({ markers: [], selectedId: null }, ctx);
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1' }, ctx);
    expect(layouts(posted)).to.have.lengthOf(2);
  });

  it('scrolls the element into view only when requested', () => {
    const { ctx, h1 } = setup();
    const calls = [];
    h1.scrollIntoView = (opts) => calls.push(opts);
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1' }, ctx);
    expect(calls).to.have.lengthOf(0);
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1', scrollIntoView: true }, ctx);
    expect(calls).to.have.lengthOf(1);
    expect(calls[0].block).to.equal('center');
    applyFindingMarkers(ctx);
    expect(calls).to.have.lengthOf(1);
  });

  it('defers the scroll until the element exists', () => {
    const { ctx } = setup();
    const calls = [];
    document.body.innerHTML = '<main></main>';
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1', scrollIntoView: true }, ctx);
    buildBody();
    const h1 = document.querySelector('h1');
    h1.scrollIntoView = (opts) => calls.push(opts);
    applyFindingMarkers(ctx);
    expect(calls).to.have.lengthOf(1);
  });

  it('re-applies after the body is rebuilt', () => {
    const { ctx } = setup();
    setFindingMarkers({ markers: [textMarker], selectedId: 'f1' }, ctx);
    buildBody();
    expect(document.querySelectorAll('.qe-finding-box')).to.have.lengthOf(0);
    applyFindingMarkers(ctx);
    expect(document.querySelectorAll('.qe-finding-box')).to.have.lengthOf(1);
  });

  it('leaves the comment overlay untouched', () => {
    const { ctx } = setup();
    setCommentMarkers({
      markers: [{ threadId: 't1', anchorType: 'text', from: 30, to: 35, anchorText: 'parag' }],
      selectedThreadId: 't1',
    }, ctx);
    const commentOverlay = document.getElementById('qe-comment-overlay');
    const before = commentOverlay.innerHTML;
    expect(before).to.not.equal('');

    setFindingMarkers({ markers: [textMarker], selectedId: 'f1' }, ctx);
    expect(document.getElementById('qe-comment-overlay').innerHTML).to.equal(before);
    expect(document.getElementById('qe-finding-overlay')).to.not.equal(commentOverlay);

    setFindingMarkers({ markers: [], selectedId: null }, ctx);
    expect(document.getElementById('qe-comment-overlay').innerHTML).to.equal(before);
  });
});
