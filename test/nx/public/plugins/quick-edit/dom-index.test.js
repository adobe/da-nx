import { expect } from '@esm-bundle/chai';
import { restoreBlockIndices } from '../../../../../nx/public/plugins/quick-edit/src/dom-index.js';

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
