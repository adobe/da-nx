import { expect } from '@esm-bundle/chai';
import init from '../../../../../../nx/blocks/card/card.js';

function buildCard(innerHtml, extraClasses = '') {
  const el = document.createElement('div');
  el.className = `nx-card${extraClasses ? ` ${extraClasses}` : ''}`;
  el.innerHTML = `<div>${innerHtml}</div>`;
  document.body.append(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

// ─── inner wrapper ────────────────────────────────────────────────────────

describe('card inner wrapper', () => {
  it('adds nx-card-inner class to first child div', () => {
    const el = buildCard('<div><p>Hello</p></div>');
    init(el);
    expect(el.querySelector('.nx-card-inner')).to.not.be.null;
  });
});

// ─── picture container ────────────────────────────────────────────────────

describe('card picture container', () => {
  it('wraps picture in nx-card-picture-container', () => {
    const el = buildCard(`
      <div>
        <p><picture><img src="test.jpg"></picture></p>
        <p>Some text</p>
      </div>
    `);
    init(el);
    const picContainer = el.querySelector('.nx-card-picture-container');
    expect(picContainer).to.not.be.null;
    expect(picContainer.querySelector('picture')).to.not.be.null;
  });

  it('removes the original picture paragraph', () => {
    const el = buildCard(`
      <div>
        <p><picture><img src="test.jpg"></picture></p>
      </div>
    `);
    init(el);
    const inner = el.querySelector('.nx-card-inner');
    const orphanPicPara = [...inner.querySelectorAll('p')].find(
      (p) => p.querySelector('picture') && !p.closest('.nx-card-picture-container'),
    );
    expect(orphanPicPara).to.be.undefined;
  });

  it('handles missing picture gracefully', () => {
    const el = buildCard('<div><p>No image here</p></div>');
    init(el);
    expect(el.querySelector('.nx-card-picture-container')).to.be.null;
  });
});

// ─── content container ────────────────────────────────────────────────────

describe('card content container', () => {
  it('adds nx-card-content-container to content div', () => {
    const el = buildCard('<div><h3>Title</h3><p>Desc</p></div>');
    init(el);
    expect(el.querySelector('.nx-card-content-container')).to.not.be.null;
  });
});

// ─── CTA ──────────────────────────────────────────────────────────────────

describe('card CTA', () => {
  it('adds nx-card-cta-container to the last paragraph with a link', () => {
    const el = buildCard(`
      <div>
        <h3>Title</h3>
        <p>Desc</p>
        <p><strong><a href="/apps/tool">Go</a></strong></p>
      </div>
    `);
    init(el);
    expect(el.querySelector('.nx-card-cta-container')).to.not.be.null;
  });

  it('moves the CTA container to the end of nx-card-inner', () => {
    const el = buildCard(`
      <div>
        <h3>Title</h3>
        <p>Desc</p>
        <p><strong><a href="/apps/tool">Go</a></strong></p>
      </div>
    `);
    init(el);
    const inner = el.querySelector('.nx-card-inner');
    const lastChild = inner.lastElementChild;
    expect(lastChild.classList.contains('nx-card-cta-container')).to.be.true;
  });

  it('does nothing when no link is found in CTA paragraph', () => {
    const el = buildCard(`
      <div>
        <h3>Title</h3>
        <p>Desc</p>
        <p>No link here</p>
      </div>
    `);
    init(el);
    expect(el.querySelector('.nx-card-cta-container')).to.be.null;
  });
});

// ─── hash-aware ───────────────────────────────────────────────────────────

describe('card hash-aware', () => {
  let originalHash;

  beforeEach(() => {
    originalHash = window.location.hash;
    window.location.hash = '#/adobe/da-live';
  });

  afterEach(() => {
    window.location.hash = originalHash;
  });

  it('appends current hash to CTA href when hash-aware class is present', () => {
    const el = buildCard(
      `<div>
        <h3>Title</h3>
        <p><strong><a href="/apps/tool">Go</a></strong></p>
      </div>`,
      'hash-aware',
    );
    init(el);
    const cta = el.querySelector('.nx-card-cta-container a');
    expect(cta.href).to.include('#/adobe/da-live');
  });

  it('does not modify href when hash-aware class is absent', () => {
    const el = buildCard(`
      <div>
        <h3>Title</h3>
        <p><strong><a href="/apps/tool">Go</a></strong></p>
      </div>
    `);
    init(el);
    const cta = el.querySelector('.nx-card-cta-container a');
    expect(cta.href).to.not.include('#/adobe/da-live');
  });
});
