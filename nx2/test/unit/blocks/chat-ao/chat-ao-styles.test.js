import { expect } from '@esm-bundle/chai';

describe('chat AO Stop button', () => {
  let host;
  let styles;

  before(async () => {
    styles = await Promise.all([
      '/nx2/styles/buttons.css',
      '/nx2/blocks/chat-ao/chat-ao.css',
    ].map(async (href) => {
      const response = await fetch(href);
      expect(response.ok).to.equal(true);
      const sheet = new CSSStyleSheet();
      await sheet.replace(await response.text());
      return sheet;
    }));
  });

  afterEach(() => host.remove());

  ['nx-btn-sm', ''].forEach((size) => {
    it(`matches the circular Send shape at the ${size || 'default'} button size`, () => {
      host = document.createElement('div');
      host.style.setProperty('--s2-spacing-75', '6px');
      host.style.setProperty('--s2-corner-radius-400', '8px');
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.adoptedStyleSheets = styles;
      shadow.innerHTML = `
        <div class="chat-actions" data-thinking>
          <button class="chat-stop nx-action-btn-icon is-active ${size}" aria-label="Stop"></button>
          <button class="chat-send nx-action-btn-icon is-active ${size}" aria-label="Send"></button>
        </div>
      `;
      document.body.append(host);
      const stop = shadow.querySelector('.chat-stop');
      const stopStyle = getComputedStyle(stop);
      const sendStyle = getComputedStyle(shadow.querySelector('.chat-send'));
      const { width, height } = stop.getBoundingClientRect();
      expect(width).to.equal(size ? 24 : 32);
      expect(height).to.equal(width);
      expect(parseFloat(stopStyle.borderTopLeftRadius)).to.be.at.least(width / 2);
      expect(stopStyle.borderRadius).to.equal(sendStyle.borderRadius);
      shadow.querySelector('.chat-actions').removeAttribute('data-thinking');
      expect(getComputedStyle(stop).display).to.equal('none');
    });
  });
});
