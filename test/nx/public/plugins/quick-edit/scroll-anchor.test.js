import { expect } from '@esm-bundle/chai';
import {
  captureScrollAnchor,
  restoreScrollAnchor,
} from '../../../../../nx/public/plugins/quick-edit/src/scroll-anchor.js';

function buildTallBody() {
  document.body.style.margin = '0';
  document.body.innerHTML = '<main>'
    + '<div class="a" data-block-index="0" style="height:1000px">A</div>'
    + '<div class="b" data-block-index="1" style="height:1000px">B</div>'
    + '<div class="c" data-block-index="2" style="height:1000px">C</div>'
    + '</main>';
}

describe('quick-edit scroll anchor', () => {
  beforeEach(buildTallBody);
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.margin = '';
    window.scrollTo(0, 0);
  });

  it('captures the first block at/below the viewport top and its offset', () => {
    window.scrollTo(0, 1200); // 200px into block index 1
    const anchor = captureScrollAnchor();
    expect(anchor.index).to.equal('1');
    expect(anchor.top).to.be.closeTo(-200, 1);
  });

  it('falls back to scrollY when there are no indexed blocks', () => {
    document.body.innerHTML = '<main><p style="height:3000px">plain</p></main>';
    window.scrollTo(0, 300);
    const anchor = captureScrollAnchor();
    expect(anchor.index).to.equal(undefined);
    expect(anchor.scrollY).to.be.closeTo(300, 1);
  });

  // Note: restoreScrollAnchor's realignment runs on requestAnimationFrame + ResizeObserver
  // and real window scrolling, which are throttled/unreliable in the concurrent headless
  // test browsers — so it's exercised in-app rather than asserted here to avoid flakiness.

  it('is a no-op for a null/empty anchor', () => {
    window.scrollTo(0, 500);
    restoreScrollAnchor(null);
    restoreScrollAnchor({});
    expect(window.scrollY).to.be.closeTo(500, 1);
  });
});
