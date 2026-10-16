import { expect } from '@esm-bundle/chai';
import { findFindingElement } from '../../../../../nx/public/plugins/quick-edit/src/findings/render.js';
import {
  findElementByAnchorText,
  normalizeAnchorText,
} from '../../../../../nx/public/plugins/quick-edit/src/dom-index.js';

// Mimics decorated EDS blocks: the button lost its data-prose-index during decoration.
function buildBody() {
  document.body.innerHTML = `
    <main>
      <div class="section">
        <p id="prev" data-prose-index="10">Welcome to the previous section</p>
      </div>
      <div class="section">
        <div class="reward block" data-block-index="40">
          <div><div>
            <p id="intro" data-prose-index="42">Earn points with every&nbsp;purchase</p>
            <p class="button-wrapper"><a id="btn" class="button" href="/rewards">Claim   Rewards</a></p>
          </div></div>
        </div>
      </div>
      <div class="section">
        <div class="offer block" data-block-index="80">
          <div><div><a id="offer-link" href="/offer">It’s a “great” offer</a></div></div>
        </div>
      </div>
    </main>`;
}

const marker = (extra = {}) => ({
  id: 'f1', anchorType: 'text', from: 60, to: 72, ...extra,
});

describe('quick-edit findings anchor text lookup', () => {
  beforeEach(buildBody);
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('normalizes whitespace, NBSP and typographic quotes', () => {
    expect(normalizeAnchorText('  a\u00a0 b\n\tc ')).to.equal('a b c');
    expect(normalizeAnchorText('\u2018x\u2019 \u201Cy\u201D')).to.equal('\'x\' "y"');
    expect(normalizeAnchorText(undefined)).to.equal('');
  });

  it('picks the decorated button when anchorText matches it', () => {
    const el = findFindingElement(marker({ anchorText: 'Claim Rewards' }));
    expect(el).to.equal(document.getElementById('btn'));
  });

  it('keeps the nearest-lower element without anchorText', () => {
    const el = findFindingElement(marker());
    expect(el).to.equal(document.getElementById('intro'));
    expect(findFindingElement(marker({ anchorText: '' }))).to.equal(document.getElementById('intro'));
  });

  it('matches NBSP/quote differences between host and DOM text', () => {
    expect(findFindingElement(marker({ anchorText: 'every purchase' })))
      .to.equal(document.getElementById('intro'));
    const el = findFindingElement({
      id: 'f2', anchorType: 'text', from: 95, to: 110, anchorText: 'It\'s a "great" offer',
    });
    expect(el).to.equal(document.getElementById('offer-link'));
  });

  it('keeps an exact prose-index hit whose text matches', () => {
    const el = findFindingElement(marker({ from: 42, anchorText: 'Earn points' }));
    expect(el).to.equal(document.getElementById('intro'));
  });

  it('keeps an exact prose-index hit when the text is found nowhere', () => {
    const el = findFindingElement(marker({ from: 42, anchorText: 'Not on this page' }));
    expect(el).to.equal(document.getElementById('intro'));
  });

  it('re-targets an exact hit whose text lives elsewhere in the block', () => {
    const el = findFindingElement(marker({ from: 42, anchorText: 'Claim Rewards' }));
    expect(el).to.equal(document.getElementById('btn'));
  });

  it('returns null when the text is not found and the hit was not exact', () => {
    expect(findFindingElement(marker({ anchorText: 'Not on this page' }))).to.equal(null);
  });

  it('falls back to the whole document when the block has no match', () => {
    const el = findFindingElement(marker({ from: 85, anchorText: 'previous section' }));
    expect(el).to.equal(document.getElementById('prev'));
  });

  it('returns null when nothing is indexed and anchorText is missing from the page', () => {
    document.body.innerHTML = '<main><p>plain</p></main>';
    expect(findFindingElement(marker({ anchorText: 'Claim Rewards' }))).to.equal(null);
  });

  it('prefers the first match after the candidate when several match', () => {
    document.getElementById('btn').insertAdjacentHTML('afterend', '<a id="btn2" class="button">Claim Rewards</a>');
    document.getElementById('prev').textContent = 'Claim Rewards early';
    const el = findFindingElement(marker({ from: 60, anchorText: 'Claim Rewards' }));
    expect(el).to.equal(document.getElementById('btn'));
  });

  it('uses the first match when none follows the candidate', () => {
    document.getElementById('btn').textContent = 'other';
    document.getElementById('prev').textContent = 'Claim Rewards early';
    const el = findFindingElement(marker({ from: 85, anchorText: 'Claim Rewards' }));
    expect(el).to.equal(document.getElementById('prev'));
  });

  it('returns the smallest element when text spans inline children', () => {
    const btn = document.getElementById('btn');
    btn.innerHTML = 'Claim <strong id="s">Rewards</strong> now';
    expect(findElementByAnchorText({ anchorText: 'Claim Rewards now', scope: document.querySelector('main') }))
      .to.equal(btn);
    expect(findElementByAnchorText({ anchorText: 'Rewards', scope: document.querySelector('main') }))
      .to.equal(document.getElementById('s'));
  });

  it('leaves image markers on their existing lookup', () => {
    document.body.innerHTML = '<main><div class="hero" data-block-index="5"><picture data-prose-index="7"><img src="/media_a.png"></picture></div></main>';
    const el = findFindingElement({ id: 'i', anchorType: 'image', from: 7, to: 8 });
    expect(el).to.equal(document.querySelector('picture'));
  });
});
