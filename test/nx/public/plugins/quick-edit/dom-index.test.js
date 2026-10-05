import { expect } from '@esm-bundle/chai';
import { restoreBlockIndices, findTextBlock } from '../../../../../nx/public/plugins/quick-edit/src/dom-index.js';

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
