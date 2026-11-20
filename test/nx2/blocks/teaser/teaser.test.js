import { expect } from '@esm-bundle/chai';
import init, { getTint } from '../../../../nx2/blocks/teaser/teaser.js';

const build = ({ picture = true, link = true, option = 'violet' } = {}) => {
  const el = document.createElement('div');
  el.className = `nx-teaser ${option}`.trim();
  el.innerHTML = `<div>
    <div>${picture ? '<picture><img src="a.png" alt=""></picture>' : ''}</div>
    <div><h3><strong>Block Inspector</strong></h3><p>Description</p>${link ? '<p><a href="https://example.com/x">View details</a></p>' : ''}</div>
  </div>`;
  return el;
};

describe('getTint', () => {
  it('maps violet to purple', () => {
    expect(getTint(['nx-teaser', 'violet'])).to.equal('--s2-purple-100');
  });
  it('is case-insensitive', () => {
    expect(getTint(['nx-teaser', 'Pink'])).to.equal('--s2-pink-100');
  });
  it('falls back to gray', () => {
    expect(getTint(['nx-teaser', 'teal'])).to.equal('--s2-gray-75');
    expect(getTint(['nx-teaser'])).to.equal('--s2-gray-75');
  });
});

describe('teaser init', () => {
  it('decorates picture, content and link', () => {
    const el = build();
    init(el);
    expect(el.style.getPropertyValue('--teaser-bg')).to.equal('var(--s2-purple-100)');
    expect(el.querySelector('.teaser-media picture')).to.exist;
    expect(el.querySelector('.teaser-content h3')).to.exist;
    const a = el.querySelector('p.teaser-cta a.teaser-cta-link');
    expect(a.getAttribute('href')).to.equal('https://example.com/x');
    expect(a.textContent).to.equal('View details');
  });

  it('adds no cta without a link', () => {
    const el = build({ link: false });
    init(el);
    expect(el.querySelector('.teaser-cta')).to.not.exist;
    expect(el.querySelector('.teaser-cta-link')).to.not.exist;
  });

  it('handles missing picture', () => {
    const el = build({ picture: false });
    init(el);
    expect(el.classList.contains('no-media')).to.be.true;
    expect(el.querySelector('.teaser-media')).to.not.exist;
    expect(el.querySelector('.teaser-content')).to.exist;
  });

  it('adopts the stylesheet once', () => {
    const before = document.adoptedStyleSheets.length;
    init(build());
    init(build());
    expect(document.adoptedStyleSheets.length - before).to.be.at.most(1);
    const added = document.adoptedStyleSheets.slice(before);
    expect(new Set(document.adoptedStyleSheets).size).to.equal(document.adoptedStyleSheets.length);
    expect(added.length).to.be.at.most(1);
  });
});
