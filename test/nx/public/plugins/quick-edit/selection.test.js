import { expect } from '@esm-bundle/chai';
import {
  blockName,
  blockSelectPayload,
  imageSelectPayload,
  setSelectedNode,
  setupNodeSelection,
} from '../../../../../nx/public/plugins/quick-edit/src/selection.js';

function buildBody() {
  document.body.innerHTML = '<main>'
    + '<div class="cards highlight" data-block-index="50">table block</div>'
    + '<div class="hero" data-block-index="60">other block</div>'
    + '<div class="no-index">unindexed</div>'
    + '<picture><img data-image-index="27" src="/img.png" alt="" style="width:100px;height:60px"></picture>'
    + '</main>';
}

describe('quick-edit selection payloads', () => {
  beforeEach(buildBody);
  afterEach(() => { document.body.innerHTML = ''; });

  it('blockName returns the first class token', () => {
    const el = document.querySelector('[data-block-index="50"]');
    expect(blockName(el)).to.equal('cards');
  });

  it('blockName is empty for an element with no class', () => {
    const el = document.createElement('div');
    expect(blockName(el)).to.equal('');
  });

  it('blockSelectPayload reads data-block-index into a table payload', () => {
    const el = document.querySelector('[data-block-index="50"]');
    expect(blockSelectPayload(el)).to.deep.equal({ anchorType: 'table', proseIndex: 50 });
  });

  it('blockSelectPayload returns null without a data-block-index', () => {
    expect(blockSelectPayload(document.querySelector('.no-index'))).to.equal(null);
    expect(blockSelectPayload(null)).to.equal(null);
  });

  it('imageSelectPayload reads data-image-index into an image payload', () => {
    const pic = document.querySelector('picture');
    expect(pic.hasAttribute('data-image-index')).to.equal(false);
    expect(imageSelectPayload(pic)).to.deep.equal({
      anchorType: 'image', proseIndex: 27, src: '/img.png', blockIndex: null,
    });
  });

  it('imageSelectPayload resolves from a child img', () => {
    const img = document.querySelector('picture img');
    expect(imageSelectPayload(img)).to.deep.equal({
      anchorType: 'image', proseIndex: 27, src: '/img.png', blockIndex: null,
    });
  });

  it('imageSelectPayload falls back to a src payload when data-image-index is missing', () => {
    document.body.innerHTML = '<div class="cards" data-block-index="80">'
      + '<picture><img src="/media_x.png?width=750"></picture></div>';
    expect(imageSelectPayload(document.querySelector('picture'))).to.deep.equal({
      anchorType: 'image', proseIndex: null, src: '/media_x.png?width=750', blockIndex: 80,
    });
  });

  it('imageSelectPayload returns null for a picture with no img and no src', () => {
    document.body.innerHTML = '<picture></picture>';
    expect(imageSelectPayload(document.querySelector('picture'))).to.equal(null);
  });
});

describe('quick-edit selection overlay', () => {
  beforeEach(buildBody);
  afterEach(() => {
    setSelectedNode(null);
    document.body.innerHTML = '';
  });

  it('setSelectedNode draws a block outline + name pill', () => {
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    const overlay = document.getElementById('qe-selection-overlay');
    expect(overlay).to.not.equal(null);
    expect(overlay.querySelector('.qe-selected-box')).to.not.equal(null);
    const pill = overlay.querySelector('.qe-selected-pill');
    expect(pill).to.not.equal(null);
    expect(pill.textContent).to.equal('cards');
  });

  it('setSelectedNode draws an image box without a pill', () => {
    setSelectedNode({ anchorType: 'image', proseIndex: 27 });
    const overlay = document.getElementById('qe-selection-overlay');
    expect(overlay.querySelector('.qe-selected-box')).to.not.equal(null);
    expect(overlay.querySelector('.qe-selected-pill')).to.equal(null);
  });

  it('setSelectedNode with null clears the overlay', () => {
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    setSelectedNode(null);
    const overlay = document.getElementById('qe-selection-overlay');
    expect(overlay.children.length).to.equal(0);
  });

  it('draws a box for a decoration-rebuilt image via the src fallback', () => {
    document.body.innerHTML = '<main><div class="cards" data-block-index="80">'
      + '<picture><img src="/media_abc.png?width=750" style="width:100px;height:60px"></picture>'
      + '</div></main>';
    setSelectedNode({ anchorType: 'image', proseIndex: 81, src: './media_abc.png' });
    const overlay = document.getElementById('qe-selection-overlay');
    expect(overlay.querySelector('.qe-selected-box')).to.not.equal(null);
  });

  it('setSelectedNode ignores an index that resolves to no element', () => {
    setSelectedNode({ anchorType: 'table', proseIndex: 9999 });
    const overlay = document.getElementById('qe-selection-overlay');
    expect(overlay?.querySelector('.qe-selected-box') ?? null).to.equal(null);
  });

  it('scrolls the element into view when requested', () => {
    const block = document.querySelector('[data-block-index="50"]');
    let scrolled = false;
    block.scrollIntoView = () => { scrolled = true; };
    setSelectedNode({ anchorType: 'table', proseIndex: 50 }, document, { scrollIntoView: true });
    expect(scrolled).to.equal(true);
  });

  it('does not scroll into view by default', () => {
    const block = document.querySelector('[data-block-index="50"]');
    let scrolled = false;
    block.scrollIntoView = () => { scrolled = true; };
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    expect(scrolled).to.equal(false);
  });
});

describe('quick-edit selection gestures', () => {
  let posted;
  let ctx;

  beforeEach(() => {
    buildBody();
    posted = [];
    ctx = { port: { postMessage: (m) => posted.push(m) } };
    setupNodeSelection(ctx);
  });
  afterEach(() => {
    setSelectedNode(null);
    document.body.innerHTML = '';
  });

  it('shows a hover pill over a block on mouseover', () => {
    const block = document.querySelector('[data-block-index="50"]');
    block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const pill = document.querySelector('#qe-selection-overlay .qe-selected-pill.is-hover');
    expect(pill).to.not.equal(null);
    expect(pill.textContent).to.equal('cards');
  });

  it('draws a persistent hover box alongside the pill', () => {
    const block = document.querySelector('[data-block-index="50"]');
    block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.querySelector('#qe-selection-overlay .qe-hover-box')).to.not.equal(null);
    expect(document.querySelector('#qe-selection-overlay .qe-selected-pill.is-hover')).to.not.equal(null);
  });

  it('removes the hover box on mouseout to empty space', () => {
    const block = document.querySelector('[data-block-index="50"]');
    block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    block.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    expect(document.querySelector('#qe-selection-overlay .qe-hover-box')).to.equal(null);
  });

  it('clears hover artifacts when the pill is clicked to select', () => {
    const block = document.querySelector('[data-block-index="50"]');
    block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.querySelector('#qe-selection-overlay .qe-selected-pill.is-hover')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.querySelector('#qe-selection-overlay .qe-hover-box')).to.equal(null);
    expect(document.querySelector('#qe-selection-overlay .qe-selected-pill.is-hover')).to.equal(null);
  });

  it('posts node-select when the hover pill is clicked', () => {
    const block = document.querySelector('[data-block-index="50"]');
    block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const pill = document.querySelector('#qe-selection-overlay .qe-selected-pill.is-hover');
    pill.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(posted).to.deep.include({
      type: 'node-select',
      node: { anchorType: 'table', proseIndex: 50 },
      payload: { node: { anchorType: 'table', proseIndex: 50 } },
    });
  });

  it('posts node-select when an image is clicked', () => {
    const img = document.querySelector('picture img');
    img.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const node = {
      anchorType: 'image', proseIndex: 27, src: '/img.png', blockIndex: null,
    };
    expect(posted).to.deep.include({ type: 'node-select', node, payload: { node } });
  });

  it('does NOT post node-select for an image drag', () => {
    const img = document.querySelector('picture img');
    img.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
    img.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(posted.some((m) => m.type === 'node-select')).to.equal(false);
  });

  it('posts node-select null on Escape when a node is selected', () => {
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(posted).to.deep.include({ type: 'node-select', node: null, payload: { node: null } });
  });

  it('hover pill is clickable (pointer-events) but the static pill is not', async () => {
    await new Promise((resolve, reject) => {
      const existing = document.getElementById('qe-css-under-test');
      if (existing) {
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

    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    const staticPill = document.querySelector('#qe-selection-overlay .qe-selected-pill:not(.is-hover)');
    expect(staticPill).to.not.equal(null);
    expect(getComputedStyle(staticPill).pointerEvents).to.equal('none');

    const block = document.querySelector('[data-block-index="60"]');
    block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const hoverPill = document.querySelector('#qe-selection-overlay .qe-selected-pill.is-hover');
    expect(hoverPill).to.not.equal(null);
    expect(getComputedStyle(hoverPill).pointerEvents).to.equal('auto');
  });

  it('does not draw a hover pill on the already-selected block', () => {
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    const block = document.querySelector('[data-block-index="50"]');
    block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const hoverPills = document.querySelectorAll('#qe-selection-overlay .qe-selected-pill.is-hover');
    expect(hoverPills.length).to.equal(0);
  });

  it('switches selection to another block without a spurious deselect', () => {
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    posted.length = 0;
    const blockB = document.querySelector('[data-block-index="60"]');
    blockB.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.querySelector('#qe-selection-overlay .qe-selected-pill.is-hover')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(posted).to.deep.include({
      type: 'node-select',
      node: { anchorType: 'table', proseIndex: 60 },
      payload: { node: { anchorType: 'table', proseIndex: 60 } },
    });
    expect(posted.some((m) => m.type === 'node-select' && m.node === null)).to.equal(false);
  });

  it('clears the selection when clicking outside it', () => {
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    document.querySelector('.no-index')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(posted).to.deep.include({ type: 'node-select', node: null, payload: { node: null } });
  });

  it('keeps the selection when clicking inside the selected block', () => {
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    document.querySelector('[data-block-index="50"]')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(posted.some((m) => m.type === 'node-select' && m.node === null)).to.equal(false);
  });

  it('does not clear on a text click (the caret round-trip handles it)', () => {
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    const text = document.createElement('p');
    text.setAttribute('data-prose-index', '70');
    document.querySelector('main').appendChild(text);
    text.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(posted.some((m) => m.type === 'node-select' && m.node === null)).to.equal(false);
  });

  it('blurs the focused inline editor when a block is selected', () => {
    const editor = document.createElement('div');
    editor.className = 'prosemirror-editor';
    const pm = document.createElement('div');
    pm.className = 'ProseMirror';
    pm.setAttribute('contenteditable', 'true');
    pm.tabIndex = 0;
    editor.appendChild(pm);
    document.querySelector('main').appendChild(editor);
    pm.focus();
    expect(document.activeElement).to.equal(pm);

    const block = document.querySelector('[data-block-index="50"]');
    block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    document.querySelector('#qe-selection-overlay .qe-selected-pill.is-hover')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.activeElement).to.not.equal(pm);
  });

  it('keeps the hover pill when selection artifacts are re-drawn', () => {
    const block = document.querySelector('[data-block-index="60"]');
    block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(document.querySelector('#qe-selection-overlay .qe-selected-pill.is-hover')).to.not.equal(null);
    setSelectedNode({ anchorType: 'image', proseIndex: 27 });
    expect(document.querySelector('#qe-selection-overlay .qe-selected-pill.is-hover')).to.not.equal(null);
  });
});
