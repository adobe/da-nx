import { expect } from '@esm-bundle/chai';
import { sendKeys, sendMouse } from '@web/test-runner-commands';
import { loadStyle } from '../../../../utils/utils.js';
import '../../../../blocks/shared/segmented-btn/segmented.js';

// Global design tokens, so the outline color resolves as on a real page.
document.adoptedStyleSheets = [...document.adoptedStyleSheets, await loadStyle('/nx2/styles/styles.css')];

describe('nx-segmented-btn focus', () => {
  let element;

  beforeEach(async () => {
    element = document.createElement('nx-segmented-btn');
    element.items = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ];
    element.value = 'a';
    document.body.append(element);
    await element.updateComplete;
  });

  afterEach(() => {
    element.remove();
  });

  const segments = () => element.shadowRoot.querySelectorAll('.segment');

  it('shows an outline on keyboard focus', async () => {
    await sendKeys({ press: 'Tab' });
    await sendKeys({ press: 'Tab' });
    const [, unselected] = segments();
    expect(element.shadowRoot.activeElement).to.equal(unselected);
    expect(getComputedStyle(unselected).outlineStyle).to.equal('solid');
    expect(getComputedStyle(unselected).outlineWidth).to.equal('2px');
  });

  it('shows no outline on mouse click', async () => {
    const [, unselected] = segments();
    const { x, y, width, height } = unselected.getBoundingClientRect();
    await sendMouse({ type: 'click', position: [Math.round(x + width / 2), Math.round(y + height / 2)] });
    expect(element.shadowRoot.activeElement).to.equal(unselected);
    expect(getComputedStyle(unselected).outlineStyle).to.equal('none');
  });
});
