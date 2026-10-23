import { expect } from '@esm-bundle/chai';
import '../../../../../../blocks/shared/popover/popover.js';

describe('nx-popover placement', () => {
  let el;
  let anchor;

  beforeEach(async () => {
    anchor = document.createElement('button');
    anchor.style.cssText = 'position:fixed;left:40px;top:40px;width:24px;height:24px;';
    el = document.createElement('nx-popover');
    el.style.cssText = 'width:100px;height:100px;--popover-gap:4px;';
    document.body.append(anchor, el);
    await el.updateComplete;
  });

  afterEach(() => {
    el.remove();
    anchor.remove();
  });

  async function show(placement) {
    el.show({ anchor, placement });
    await el.updateComplete;
    await new Promise(requestAnimationFrame);
    return el.getBoundingClientRect();
  }

  it('opens to the right without changing the default below placement', async () => {
    const right = await show('right');
    expect(right.left).to.equal(anchor.getBoundingClientRect().right + 4);
    expect(right.top).to.equal(40);
    el.close();
    await el.updateComplete;
    const below = await show('below');
    expect(below.left).to.equal(40);
    expect(below.top).to.equal(anchor.getBoundingClientRect().bottom + 4);
  });

  it('flips sideways menus to the left near the viewport edge', async () => {
    anchor.style.left = `${innerWidth - 40}px`;
    const rect = await show('right');
    expect(rect.left).to.equal(anchor.getBoundingClientRect().left - 4 - rect.width);
  });

  it('keeps sideways menus within the viewport and follows their anchor', async () => {
    anchor.style.top = `${innerHeight - 40}px`;
    const rect = await show('right');
    expect(rect.bottom).to.be.at.most(innerHeight - 10);
    anchor.style.left = '70px';
    document.dispatchEvent(new Event('scroll'));
    await new Promise(requestAnimationFrame);
    expect(el.getBoundingClientRect().left).to.equal(anchor.getBoundingClientRect().right + 4);
  });
});
