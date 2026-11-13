import { expect } from '@esm-bundle/chai';
import { iconSvg } from '../../../../blocks/shared/utils/icons.js';

const ICON = '/img/icons/s2-icon-tools-20-n.svg';

describe('iconSvg', () => {
  it('renders a decorative svg that uses the icon', () => {
    const svg = iconSvg({ href: ICON });
    expect(svg.namespaceURI).to.equal('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('viewBox')).to.equal('0 0 20 20');
    expect(svg.getAttribute('aria-hidden')).to.equal('true');
    const use = svg.querySelector('use');
    expect(use.getAttribute('href')).to.equal(`${ICON}#icon`);
    expect([use.getAttribute('width'), use.getAttribute('height')]).to.deep.equal(['100%', '100%']);
  });

  it('sets the slot when given', () => {
    expect(iconSvg({ href: ICON, slot: 'icon' }).getAttribute('slot')).to.equal('icon');
  });

  it('has no slot by default', () => {
    expect(iconSvg({ href: ICON }).hasAttribute('slot')).to.be.false;
  });

  it('escapes the href', () => {
    const svg = iconSvg({ href: '/x.svg"><img src=y>' });
    expect(svg.querySelectorAll('img').length).to.equal(0);
    expect(svg.querySelector('use').getAttribute('href')).to.equal('/x.svg"><img src=y>#icon');
  });
});
