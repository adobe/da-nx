import { expect } from '@esm-bundle/chai';
import '../../../../blocks/shared/switch/switch.js';

describe('nx-switch sizing', () => {
  let element;

  beforeEach(() => {
    element = document.createElement('nx-switch');
    document.body.append(element);
  });

  afterEach(() => {
    element.remove();
  });

  const trackSize = (el) => {
    const { width, height } = getComputedStyle(el.shadowRoot.querySelector('.track'));
    return { width, height };
  };

  it('uses medium sizing with an undefined size and no size attribute', async () => {
    await element.updateComplete;
    expect(element.size).to.equal(undefined);
    expect(element.hasAttribute('size')).to.equal(false);
    expect(trackSize(element)).to.deep.equal({ width: '28px', height: '16px' });
  });

  it('preserves explicit medium sizing and reflection', async () => {
    element.size = 'm';
    await element.updateComplete;
    expect(element.getAttribute('size')).to.equal('m');
    expect(trackSize(element)).to.deep.equal({ width: '28px', height: '16px' });
  });

  it('preserves small sizing and reflection', async () => {
    element.size = 'sm';
    await element.updateComplete;
    expect(element.getAttribute('size')).to.equal('sm');
    expect(trackSize(element)).to.deep.equal({ width: '24px', height: '14px' });
  });

  it('returns to medium sizing when size is reset to undefined', async () => {
    element.size = 'sm';
    await element.updateComplete;
    element.size = undefined;
    await element.updateComplete;
    expect(element.hasAttribute('size')).to.equal(false);
    expect(trackSize(element)).to.deep.equal({ width: '28px', height: '16px' });
  });
});
