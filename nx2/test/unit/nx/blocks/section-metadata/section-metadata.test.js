import { expect } from '@esm-bundle/chai';
import init from '../../../../../../nx/blocks/section-metadata/section-metadata.js';

function buildSection(innerHtml) {
  const section = document.createElement('div');
  section.className = 'section';
  section.innerHTML = innerHtml;
  document.body.append(section);
  return section;
}

function buildNx2Section({ cards = 2, metaRows = [] } = {}) {
  const cardHtml = Array.from({ length: cards }, (_, i) => `<div class="nx-card"><div>Card ${i}</div></div>`).join('');
  const metaRowsHtml = metaRows.map(([key, val]) => `<div><div>${key}</div><div>${val}</div></div>`).join('');
  const section = buildSection(`
    <div class="block-content">
      ${cardHtml}
      <div class="nx-section-metadata">${metaRowsHtml}</div>
    </div>
  `);
  return {
    section,
    el: section.querySelector('.nx-section-metadata'),
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

// ─── handleContainer: NX2 block-content unwrapping ────────────────────────

describe('section-metadata handleContainer (NX2 structure)', () => {
  it('unwraps block-content children into nx-section-container', async () => {
    const { section, el } = buildNx2Section({ cards: 3 });
    await init(el);
    const container = section.querySelector('.nx-section-container');
    expect(container).to.not.be.null;
    expect(container.querySelectorAll('.nx-card').length).to.equal(3);
  });

  it('excludes nx-section-metadata from nx-section-container', async () => {
    const { section, el } = buildNx2Section({ cards: 2 });
    await init(el);
    const container = section.querySelector('.nx-section-container');
    expect(container.querySelector('.nx-section-metadata')).to.be.null;
  });

  it('removes the section-metadata element after init', async () => {
    const { section, el } = buildNx2Section({ cards: 2 });
    await init(el);
    expect(section.querySelector('.nx-section-metadata')).to.be.null;
  });
});

// ─── handleContainer: flat (NX1-compatible) structure ─────────────────────

describe('section-metadata handleContainer (flat structure)', () => {
  it('wraps flat children into nx-section-container', async () => {
    const section = buildSection(`
      <div class="nx-card"><div>Card 1</div></div>
      <div class="nx-card"><div>Card 2</div></div>
      <div class="nx-section-metadata">
        <div><div>grid</div><div>2</div></div>
      </div>
    `);
    const el = section.querySelector('.nx-section-metadata');
    await init(el);
    const container = section.querySelector('.nx-section-container');
    expect(container).to.not.be.null;
    expect(container.querySelectorAll('.nx-card').length).to.equal(2);
    expect(container.querySelector('.nx-section-metadata')).to.be.null;
  });
});

// ─── grid layout class ────────────────────────────────────────────────────

describe('section-metadata grid', () => {
  it('adds grid-4 class to section', async () => {
    const { section, el } = buildNx2Section({
      cards: 4,
      metaRows: [['grid', '4']],
    });
    await init(el);
    expect(section.classList.contains('grid-4')).to.be.true;
  });

  it('adds grid-3 class to section', async () => {
    const { section, el } = buildNx2Section({
      cards: 3,
      metaRows: [['grid', '3']],
    });
    await init(el);
    expect(section.classList.contains('grid-3')).to.be.true;
  });

  it('skips grid class when value is 0', async () => {
    const { section, el } = buildNx2Section({
      metaRows: [['grid', '0']],
    });
    await init(el);
    const gridClasses = [...section.classList].filter((c) => c.startsWith('grid-'));
    expect(gridClasses.length).to.equal(0);
  });
});

// ─── gap class ───────────────────────────────────────────────────────────

describe('section-metadata gap', () => {
  it('adds gap-600 class to section', async () => {
    const { section, el } = buildNx2Section({ metaRows: [['gap', '600']] });
    await init(el);
    expect(section.classList.contains('gap-600')).to.be.true;
  });
});

// ─── spacing classes ─────────────────────────────────────────────────────

describe('section-metadata spacing', () => {
  it('adds spacing-600 class to section', async () => {
    const { section, el } = buildNx2Section({ metaRows: [['spacing', '600']] });
    await init(el);
    expect(section.classList.contains('spacing-600')).to.be.true;
  });

  it('adds spacing-top-400 class to section', async () => {
    const { section, el } = buildNx2Section({ metaRows: [['spacing-top', '400']] });
    await init(el);
    expect(section.classList.contains('spacing-top-400')).to.be.true;
  });

  it('adds spacing-bottom-800 class to section', async () => {
    const { section, el } = buildNx2Section({ metaRows: [['spacing-bottom', '800']] });
    await init(el);
    expect(section.classList.contains('spacing-bottom-800')).to.be.true;
  });
});

// ─── style classes ───────────────────────────────────────────────────────

describe('section-metadata style', () => {
  it('adds multiple style classes to section', async () => {
    const { section, el } = buildNx2Section({
      metaRows: [['style', 'container, center']],
    });
    await init(el);
    expect(section.classList.contains('container')).to.be.true;
    expect(section.classList.contains('center')).to.be.true;
  });

  it('converts spaces in style names to hyphens', async () => {
    const { section, el } = buildNx2Section({
      metaRows: [['style', 'dark background']],
    });
    await init(el);
    expect(section.classList.contains('dark-background')).to.be.true;
  });
});

// ─── background ──────────────────────────────────────────────────────────

describe('section-metadata background', () => {
  it('applies background color from text content', async () => {
    const { section, el } = buildNx2Section({
      metaRows: [['background', 'red']],
    });
    await init(el);
    expect(section.style.background).to.equal('red');
  });

  it('adds has-background class when a picture is present', async () => {
    const section = buildSection(`
      <div class="block-content">
        <div class="nx-section-metadata">
          <div>
            <div>background</div>
            <div><picture><img src="bg.jpg"></picture></div>
          </div>
        </div>
      </div>
    `);
    const el = section.querySelector('.nx-section-metadata');
    await init(el);
    expect(section.classList.contains('has-background')).to.be.true;
    expect(section.querySelector('picture.section-background')).to.not.be.null;
  });
});

// ─── no section guard ────────────────────────────────────────────────────

describe('section-metadata no section', () => {
  it('does nothing if el has no .section ancestor', async () => {
    const el = document.createElement('div');
    el.className = 'nx-section-metadata';
    document.body.append(el);
    // Should not throw
    await init(el);
    expect(document.querySelector('.nx-section-container')).to.be.null;
  });
});
