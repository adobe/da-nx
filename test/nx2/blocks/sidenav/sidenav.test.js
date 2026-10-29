import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../../../nx2/blocks/sidenav/sidenav.js';

describe('sidenav actions', () => {
  let nav;

  beforeEach(async () => {
    const Sidenav = customElements.get('nx-sidenav');
    sinon.stub(Sidenav.prototype, 'loadNav').callsFake(function loadNav() {
      this._navLinks = [{ text: 'Home', href: `${window.location.origin}/`, icon: '' }];
    });
    nav = document.createElement('nx-sidenav');
    document.body.append(nav);
    await nav.updateComplete;
  });

  afterEach(() => {
    nav.remove();
    sinon.restore();
  });

  it('keeps the existing menu unchanged without host actions', () => {
    expect(nav.shadowRoot.querySelectorAll('.nav-link')).to.have.length(1);
    expect(nav.shadowRoot.querySelector('.nav-action')).to.equal(null);
  });

  it('places an accessible host action before links and respects its disabled state', async () => {
    const onClick = sinon.spy();
    nav.actions = [{ label: 'Open chat', icon: '/assistant.svg', disabled: true, onClick }];
    await nav.updateComplete;
    const button = nav.shadowRoot.querySelector('button');
    expect(nav.shadowRoot.querySelector('li').className).to.equal('nav-action');
    expect(button.getAttribute('aria-label')).to.equal('Open chat');
    button.click();
    expect(onClick.called).to.equal(false);
    nav.actions = [{ ...nav.actions[0], disabled: false }];
    await nav.updateComplete;
    button.click();
    expect(onClick.calledOnce).to.equal(true);
    expect(nav.shadowRoot.querySelectorAll('.nav-link')).to.have.length(1);
    nav.actions = [];
    await nav.updateComplete;
    expect(nav.shadowRoot.querySelector('.nav-action')).to.equal(null);
  });

  it('sizes host action graphics through their component property', async () => {
    nav.actions = [{ label: 'Open chat', icon: '/assistant.svg', onClick() {} }];
    await nav.updateComplete;
    const image = nav.shadowRoot.querySelector('.nav-action img');
    expect(image.getBoundingClientRect().width).to.equal(32);
    nav.style.setProperty('--nx-sidenav-action-icon-size', '40px');
    expect(image.getBoundingClientRect().width).to.equal(40);
    expect(image.getBoundingClientRect().height).to.equal(40);
  });

  it('lets SVG artwork overflow and switches to an accessible selected glyph', async () => {
    nav.style.setProperty('--s2-gray-800', 'rgb(41 41 41)');
    nav.style.setProperty('--s2-gray-25', 'rgb(255 255 255)');
    nav.actions = [{
      label: 'Open chat',
      icon: '/assistant.svg#icon',
      activeIcon: '/coworker.svg#icon',
      active: false,
    }];
    await nav.updateComplete;
    const button = nav.shadowRoot.querySelector('button');
    const artwork = button.querySelector('svg');
    button.style.transition = 'none';
    expect(artwork.getBoundingClientRect().width).to.equal(32);
    expect(artwork.getBoundingClientRect().height).to.equal(32);
    expect(getComputedStyle(artwork).overflow).to.equal('visible');
    expect(getComputedStyle(button).overflow).to.equal('visible');
    expect(button.getAttribute('aria-pressed')).to.equal('false');
    nav.actions = [{ ...nav.actions[0], active: true }];
    await nav.updateComplete;
    expect(button.getAttribute('aria-pressed')).to.equal('true');
    expect(button.querySelector('.nav-action-artwork')).to.equal(null);
    expect(button.querySelector('use').getAttribute('href')).to.equal('/coworker.svg#icon');
    expect(button.querySelector('svg').getBoundingClientRect().width).to.equal(18);
    expect(button.getBoundingClientRect().width).to.equal(32);
    expect(button.getBoundingClientRect().height).to.equal(32);
    expect(getComputedStyle(button).borderRadius).to.equal('50%');
    expect(getComputedStyle(button).backgroundColor).to.equal('rgb(41, 41, 41)');
    expect(getComputedStyle(button).color).to.equal('rgb(255, 255, 255)');
    nav.actions = [{ ...nav.actions[0], active: false }];
    await nav.updateComplete;
    expect(button.querySelector('.nav-action-artwork')).not.to.equal(null);
    expect(button.getAttribute('aria-pressed')).to.equal('false');
  });
});
