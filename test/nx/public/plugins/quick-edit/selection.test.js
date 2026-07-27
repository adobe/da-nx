import { expect } from '@esm-bundle/chai';
import {
  blockName,
  blockSelectPayload,
  imageSelectPayload,
  setSelectedNode,
  setupNodeSelection,
  setVariantCatalog,
  getVariantCatalog,
  takePendingVariantScrollIndex,
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
      payload: { node: { anchorType: 'table', proseIndex: 50 } },
    });
  });

  it('posts node-select when an image is clicked', () => {
    const img = document.querySelector('picture img');
    img.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const node = {
      anchorType: 'image', proseIndex: 27, src: '/img.png', blockIndex: null,
    };
    expect(posted).to.deep.include({ type: 'node-select', payload: { node } });
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
    expect(posted).to.deep.include({ type: 'node-select', payload: { node: null } });
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
      payload: { node: { anchorType: 'table', proseIndex: 60 } },
    });
    expect(posted.some((m) => m.type === 'node-select' && m.payload?.node === null)).to.equal(false);
  });

  it('clears the selection when clicking outside it', () => {
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    document.querySelector('.no-index')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(posted).to.deep.include({ type: 'node-select', payload: { node: null } });
  });

  it('keeps the selection when clicking inside the selected block', () => {
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    document.querySelector('[data-block-index="50"]')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(posted.some((m) => m.type === 'node-select' && m.payload?.node === null)).to.equal(false);
  });

  it('does not clear on a text click (the caret round-trip handles it)', () => {
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    const text = document.createElement('p');
    text.setAttribute('data-prose-index', '70');
    document.querySelector('main').appendChild(text);
    text.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(posted.some((m) => m.type === 'node-select' && m.payload?.node === null)).to.equal(false);
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

describe('variant catalog + variant-select button', () => {
  beforeEach(buildBody);
  afterEach(() => {
    setSelectedNode(null);
    setVariantCatalog({});
    document.body.innerHTML = '';
  });

  it('getVariantCatalog reflects the last setVariantCatalog call', () => {
    setVariantCatalog({ cards: ['large', 'light'] });
    expect(getVariantCatalog()).to.deep.equal({ cards: ['large', 'light'] });
  });

  it('defaults to an empty catalog', () => {
    expect(getVariantCatalog()).to.deep.equal({});
  });

  it('setVariantCatalog(null) resets to an empty catalog', () => {
    setVariantCatalog({ cards: ['large'] });
    setVariantCatalog(null);
    expect(getVariantCatalog()).to.deep.equal({});
  });

  it('renders the variant-select button on the selected pill when the catalog has entries for this block', () => {
    setVariantCatalog({ cards: ['large'] });
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    const button = document.querySelector('#qe-selection-overlay .qe-selected-box .qe-pill-block-variant-select');
    expect(button).to.not.equal(null);
  });

  it('does not render the variant-select button when the catalog has no entries for this block', () => {
    setVariantCatalog({});
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    const button = document.querySelector('#qe-selection-overlay .qe-selected-box .qe-pill-block-variant-select');
    expect(button).to.equal(null);
  });

  it('matches the catalog key case-insensitively against the block\'s class name', () => {
    setVariantCatalog({ CARDS: ['large'] });
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    const button = document.querySelector('#qe-selection-overlay .qe-selected-box .qe-pill-block-variant-select');
    expect(button).to.not.equal(null);
  });

  it('also renders the variant-select button on the hover pill, so it works without selecting first', () => {
    setVariantCatalog({ cards: ['large'] });
    const block = document.querySelector('[data-block-index="50"]');
    block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const button = document.querySelector('#qe-selection-overlay .qe-hover-box .qe-pill-block-variant-select');
    expect(button).to.not.equal(null);
  });

  it('closes a hover-triggered menu once the block is no longer hovered', () => {
    setVariantCatalog({ cards: ['large'] });
    const block = document.querySelector('[data-block-index="50"]');
    block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const button = document.querySelector('#qe-selection-overlay .qe-hover-box .qe-pill-block-variant-select');
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.getElementById('qe-variant-menu')).to.not.equal(null);

    block.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    expect(document.getElementById('qe-variant-menu')).to.equal(null);
  });

  it('does not close a selected block\'s menu just because the mouse moves away', () => {
    setVariantCatalog({ cards: ['large'] });
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    const trigger = document.querySelector('#qe-selection-overlay .qe-selected-box .qe-pill-block-variant-select');
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.getElementById('qe-variant-menu')).to.not.equal(null);

    const block = document.querySelector('[data-block-index="50"]');
    block.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    expect(document.getElementById('qe-variant-menu')).to.not.equal(null);
  });

  it('does not render a variant-select button on the hover pill when the catalog has no entries', () => {
    setVariantCatalog({});
    const block = document.querySelector('[data-block-index="50"]');
    block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const button = document.querySelector('#qe-selection-overlay .qe-hover-box .qe-pill-block-variant-select');
    expect(button).to.equal(null);
  });

  function variantButton() {
    return document.querySelector('#qe-selection-overlay .qe-selected-box .qe-pill-block-variant-select');
  }

  function menuItems() {
    return [...document.querySelectorAll('#qe-variant-menu .qe-variant-menu-item')];
  }

  it('lists atomic variant tokens as menu items, not the blockName-prefixed label', () => {
    setVariantCatalog({ cards: ['large', 'light'] });
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    variantButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menuItems().map((el) => el.textContent)).to.deep.equal(['large', 'light']);
  });

  it('marks a token as checked (is-active, for the CSS checkmark) when it matches one of the block\'s already-applied classes', () => {
    // buildBody's block 50 is class="cards highlight" — "highlight" is already applied.
    setVariantCatalog({ cards: ['highlight', 'large'] });
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    variantButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const [highlight, large] = menuItems();
    expect(highlight.classList.contains('is-active')).to.equal(true);
    expect(large.classList.contains('is-active')).to.equal(false);
  });

  it('closes the menu when clicking outside it', () => {
    setVariantCatalog({ cards: ['large'] });
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    variantButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.getElementById('qe-variant-menu')).to.not.equal(null);

    document.querySelector('.no-index').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.getElementById('qe-variant-menu')).to.equal(null);
  });

  it('clicking the trigger again toggles the menu closed', () => {
    setVariantCatalog({ cards: ['large'] });
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    variantButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.getElementById('qe-variant-menu')).to.not.equal(null);

    variantButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.getElementById('qe-variant-menu')).to.equal(null);
  });
});

describe('variant menu selection', () => {
  let posted;
  let ctx;

  beforeEach(() => {
    buildBody();
    setVariantCatalog({ cards: ['highlight', 'large', 'light'] });
    posted = [];
    ctx = { port: { postMessage: (m) => posted.push(m) } };
    setupNodeSelection(ctx);
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
  });
  afterEach(() => {
    setSelectedNode(null);
    setVariantCatalog({});
    takePendingVariantScrollIndex();
    document.body.innerHTML = '';
  });

  function trigger() {
    return document.querySelector('#qe-selection-overlay .qe-selected-box .qe-pill-block-variant-select');
  }

  function openMenu() {
    trigger().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  }

  function clickItem(label) {
    const item = [...document.querySelectorAll('#qe-variant-menu .qe-variant-menu-item')]
      .find((el) => el.textContent === label);
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  }

  it('composes the label from just the newly-toggled-on token when none was active', () => {
    // buildBody's block 50 has class="cards highlight", but the catalog here only
    // exposes 'large'/'light' as togglable (not 'highlight'), so none start active.
    setVariantCatalog({ cards: ['large', 'light'] });
    setSelectedNode({ anchorType: 'table', proseIndex: 50 });
    openMenu();
    clickItem('large');

    expect(posted).to.deep.include({
      type: 'apply-variant',
      payload: { node: { proseIndex: 50 }, label: 'cards (large)' },
    });
  });

  it('composes a combined label when toggling on a second token alongside an already-active one', () => {
    // 'highlight' is already applied (buildBody's class="cards highlight"); toggling
    // 'large' on should combine with it, in catalog order.
    openMenu();
    clickItem('large');

    expect(posted).to.deep.include({
      type: 'apply-variant',
      payload: { node: { proseIndex: 50 }, label: 'cards (highlight, large)' },
    });
  });

  it('toggling off the only active token resets to the base block name', () => {
    openMenu();
    clickItem('highlight');

    expect(posted).to.deep.include({
      type: 'apply-variant',
      payload: { node: { proseIndex: 50 }, label: 'cards' },
    });
  });

  it('also posts node-select for the affected block, so doc-mode/outline stays in sync', () => {
    openMenu();
    clickItem('large');

    expect(posted).to.deep.include({
      type: 'node-select',
      payload: { node: { anchorType: 'table', proseIndex: 50 } },
    });
  });

  it('marks the block for a deferred scroll, consumed once by takePendingVariantScrollIndex', () => {
    openMenu();
    clickItem('large');
    expect(takePendingVariantScrollIndex()).to.equal(50);
    expect(takePendingVariantScrollIndex()).to.equal(null);
  });

  it('closes the menu after applying a selection', () => {
    openMenu();
    clickItem('large');
    expect(document.getElementById('qe-variant-menu')).to.equal(null);
  });

  it('clicking the variant-select button does not clear the block selection', () => {
    openMenu();
    expect(posted.some((m) => m.type === 'node-select')).to.equal(false);
  });

  it('Escape closes an open menu without deselecting the block', () => {
    openMenu();
    expect(document.getElementById('qe-variant-menu')).to.not.equal(null);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('qe-variant-menu')).to.equal(null);
    expect(posted.some((m) => m.type === 'node-select' && m.payload?.node === null)).to.equal(false);
  });

  it('Escape deselects the block when no menu is open (existing behavior unchanged)', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(posted).to.deep.include({ type: 'node-select', payload: { node: null } });
  });
});
