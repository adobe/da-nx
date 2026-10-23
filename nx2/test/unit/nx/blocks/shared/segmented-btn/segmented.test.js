import { expect } from '@esm-bundle/chai';
import '../../../../../../blocks/shared/segmented-btn/segmented.js';

describe('nx-segmented-btn variants', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('nx-segmented-btn');
    el.items = [{ value: 'card', label: 'Grid' }, { value: 'list', label: 'List' }];
    el.value = 'card';
    document.body.append(el);
    await el.updateComplete;
  });

  afterEach(() => el.remove());

  it('keeps the default pill and opts into a quiet group without changing selection events', async () => {
    expect(el.hasAttribute('variant')).to.equal(false);
    el.variant = 'quiet';
    el.size = 'm';
    await el.updateComplete;
    expect(el.getAttribute('variant')).to.equal('quiet');
    expect(getComputedStyle(el.shadowRoot.querySelector('.segmented')).padding).to.equal('0px');
    expect(el.shadowRoot.querySelector('button').getBoundingClientRect().height).to.equal(32);
    const change = new Promise((resolve) => { el.addEventListener('change', resolve, { once: true }); });
    el.shadowRoot.querySelectorAll('button')[1].click();
    expect((await change).detail.value).to.equal('list');
    await el.updateComplete;
    expect(el.shadowRoot.querySelectorAll('button')[1].getAttribute('aria-pressed')).to.equal('true');
  });
});
