import { expect } from '@esm-bundle/chai';
import { serialize } from '../../../nx/blocks/form/app/serialize.js';

describe('serialize', () => {
  it('rejects non-object inputs', () => {
    expect(serialize({ json: null })).to.have.property('error');
    expect(serialize({ json: 'x' })).to.have.property('error');
    expect(serialize({ json: ['a'] })).to.have.property('error');
  });

  it('returns html for a minimal valid payload', () => {
    const result = serialize({
      json: { metadata: { schemaName: 'x' }, data: { name: 'Alice' } },
    });
    expect(result.html).to.be.a('string').and.have.length.greaterThan(0);
    expect(result.html).to.include('Alice');
  });

  describe('prune', () => {
    function prunedData(input) {
      // Use the schema HTML output as a black-box probe of what survived pruning.
      const { html } = serialize({ json: { metadata: { schemaName: 'x' }, data: input } });
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return doc.querySelector('.x');
    }

    it('drops empty strings, null, undefined', () => {
      const block = prunedData({
        keep: 'value', empty: '', whitespace: '   ', missing: null,
      });
      expect(block.textContent).to.include('keep');
      expect(block.textContent).to.not.include('empty');
      expect(block.textContent).to.not.include('whitespace');
      expect(block.textContent).to.not.include('missing');
    });

    it('drops empty arrays and empty objects', () => {
      const block = prunedData({ list: [], obj: {}, kept: 'x' });
      expect(block.textContent).to.not.include('list');
      expect(block.textContent).to.not.include('obj');
      expect(block.textContent).to.include('kept');
    });

    it('keeps a value buried inside an otherwise-empty object', () => {
      // Bottom-up prune: nested.real survives, so nested survives.
      const block = prunedData({
        nested: { trash: '', real: 'value' },
      });
      expect(block.textContent).to.include('nested');
    });

    it('prunes nested empty subtrees recursively', () => {
      const block = prunedData({
        a: { b: { c: '' } },
        keep: 'x',
      });
      expect(block.textContent).to.not.include('a');
      expect(block.textContent).to.include('keep');
    });
  });
});
