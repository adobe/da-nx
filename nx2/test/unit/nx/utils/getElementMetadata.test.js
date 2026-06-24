import { expect } from '@esm-bundle/chai';
import getElementMetadata from '../../../../utils/getElementMetadata.js';

function buildEl(rows) {
  const el = document.createElement('div');
  el.innerHTML = rows.map(([key, val]) => `
    <div>
      <div>${key}</div>
      <div>${val}</div>
    </div>
  `).join('');
  return el;
}

// ─── basic parsing ────────────────────────────────────────────────────────

describe('getElementMetadata', () => {
  it('returns empty object for null', () => {
    expect(getElementMetadata(null)).to.deep.equal({});
  });

  it('returns empty object for element with no children', () => {
    const el = document.createElement('div');
    expect(getElementMetadata(el)).to.deep.equal({});
  });

  it('parses a single key-value row', () => {
    const el = buildEl([['style', 'container']]);
    const result = getElementMetadata(el);
    expect(result.style.text).to.equal('container');
  });

  it('parses multiple rows', () => {
    const el = buildEl([['grid', '4'], ['gap', '600'], ['spacing', '800']]);
    const result = getElementMetadata(el);
    expect(result.grid.text).to.equal('4');
    expect(result.gap.text).to.equal('600');
    expect(result.spacing.text).to.equal('800');
  });

  it('lowercases keys', () => {
    const el = buildEl([['STYLE', 'center']]);
    const result = getElementMetadata(el);
    expect(result.style).to.not.be.undefined;
  });

  it('lowercases text values', () => {
    const el = buildEl([['style', 'Container, Center']]);
    const result = getElementMetadata(el);
    expect(result.style.text).to.equal('container, center');
  });

  it('exposes the raw content element', () => {
    const el = buildEl([['background', 'red']]);
    const result = getElementMetadata(el);
    expect(result.background.content).to.be.instanceof(HTMLElement);
    expect(result.background.content.textContent.trim()).to.equal('red');
  });
});
