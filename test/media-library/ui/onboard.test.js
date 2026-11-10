import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import '../../../nx/blocks/media-library/ui/views/onboard/onboard.js';

const SITES_KEY = 'da-sites';

async function waitFor(fn) {
  for (let i = 0; i < 100; i += 1) {
    const result = fn();
    if (result) return result;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { requestAnimationFrame(resolve); });
  }
  return null;
}

describe('nx-media-onboard site cards', () => {
  let el;
  let savedSites;

  beforeEach(async () => {
    savedSites = localStorage.getItem(SITES_KEY);
    localStorage.setItem(SITES_KEY, JSON.stringify(['aem-sandbox/block-collection']));
    el = document.createElement('nx-media-onboard');
    document.body.append(el);
    await waitFor(() => el.shadowRoot?.querySelector('.nx-card'));
  });

  afterEach(() => {
    el.remove();
    if (savedSites === null) localStorage.removeItem(SITES_KEY);
    else localStorage.setItem(SITES_KEY, savedSites);
  });

  it('opens a site with the keyboard from a labelled button', async () => {
    const selected = [];
    el.addEventListener('site-selected', (e) => selected.push(e.detail.sitePath));

    const open = el.shadowRoot.querySelector('.nx-card .card-open');
    expect(open.tagName).to.equal('BUTTON');
    expect(open.getAttribute('aria-label')).to.equal('Open aem-sandbox/block-collection');

    open.focus();
    await sendKeys({ press: 'Enter' });
    expect(selected).to.deep.equal(['/aem-sandbox/block-collection']);
  });

  it('keeps the hidden face of a card out of the tab order', async () => {
    const card = el.shadowRoot.querySelector('.nx-card');
    expect(card.querySelector('.nx-card-front').inert).to.be.false;
    expect(card.querySelector('.nx-card-back').inert).to.be.true;

    card.querySelector('.nx-card-front .card-menu-btn').click();
    await el.updateComplete;
    expect(card.querySelector('.nx-card-front').inert).to.be.true;
    expect(card.querySelector('.nx-card-back').inert).to.be.false;
  });

  it('moves focus to the visible face when the card is flipped with the keyboard', async () => {
    const card = el.shadowRoot.querySelector('.nx-card');
    card.querySelector('.nx-card-front .card-menu-btn').focus();

    await sendKeys({ press: 'Enter' });
    await el.updateComplete;
    expect(el.shadowRoot.activeElement).to.equal(card.querySelector('.nx-card-back .share-btn'));

    card.querySelector('.nx-card-back .card-menu-btn').focus();
    await sendKeys({ press: 'Enter' });
    await el.updateComplete;
    expect(el.shadowRoot.activeElement).to.equal(card.querySelector('.nx-card-front .card-menu-btn'));
  });

  it('does not resize the options icon on keyboard focus', async () => {
    const menuBtn = el.shadowRoot.querySelector('.nx-card-front .card-menu-btn');
    const icon = menuBtn.querySelector('svg.more');
    const { width, height } = icon.getBoundingClientRect();

    el.shadowRoot.querySelector('.nx-card .card-open').focus();
    await sendKeys({ press: 'Tab' });
    expect(el.shadowRoot.activeElement).to.equal(menuBtn);
    expect(menuBtn.matches(':focus-visible')).to.be.true;

    const focused = icon.getBoundingClientRect();
    expect(focused.width).to.equal(width);
    expect(focused.height).to.equal(height);
  });
});
