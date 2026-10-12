import { expect } from '@esm-bundle/chai';

describe('chat AO message icon sizing', () => {
  let host;
  let styles;

  before(async () => {
    const response = await fetch('/nx2/blocks/chat-ao/chat-ao.css');
    expect(response.ok).to.be.true;
    styles = new CSSStyleSheet();
    await styles.replace(await response.text());
  });

  beforeEach(() => {
    host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.adoptedStyleSheets = [styles];
    shadow.innerHTML = `
      <div class="message">
        <button class="message-action-copy">
          <svg class="icon-paste"></svg>
          <svg class="icon-checkmark"></svg>
        </button>
        <svg class="selection-icon"></svg>
      </div>
    `;
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('uses component-owned 14px icons in s and 16px icons in m', () => {
    const icons = [...host.shadowRoot.querySelectorAll('svg')];
    for (const size of [null, 's', 'm', 's']) {
      if (size === null) host.removeAttribute('data-ui-size');
      else host.setAttribute('data-ui-size', size);
      icons.forEach((icon) => {
        const style = getComputedStyle(icon);
        const expected = size === 'm' ? '16px' : '14px';
        expect(style.width).to.equal(expected);
        expect(style.height).to.equal(expected);
      });
    }
  });
});
