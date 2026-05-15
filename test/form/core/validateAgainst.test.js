import { expect } from '@esm-bundle/chai';
import { validateAgainst } from '../../../nx/blocks/form/core/index.js';

describe('validateAgainst', () => {
  it('returns no errors for a clean document', () => {
    const result = validateAgainst(
      { type: 'object', properties: { name: { type: 'string', title: 'Name' } } },
      { name: 'Alice' },
    );
    expect(result.errorsByPointer).to.deep.equal({});
    expect(result.schemaIssues).to.deep.equal([]);
    expect(result.editable).to.equal(true);
  });

  it('flags missing required fields at the child pointer', () => {
    const result = validateAgainst(
      {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', title: 'Name' } },
      },
      { name: '' },
    );
    expect(result.errorsByPointer['/data/name']).to.equal('This field is required.');
  });

  it('flags a constraint violation', () => {
    const result = validateAgainst(
      {
        type: 'object',
        properties: { name: { type: 'string', title: 'Name', minLength: 3 } },
      },
      { name: 'ab' },
    );
    expect(result.errorsByPointer['/data/name']).to.match(/at least 3/);
  });

  it('reports schemaIssues when the schema uses an unsupported construct', () => {
    const result = validateAgainst(
      {
        type: 'object',
        properties: {
          choice: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        },
      },
      {},
    );
    expect(result.editable).to.equal(false);
    expect(result.schemaIssues.length).to.be.greaterThan(0);
    expect(result.schemaIssues.some((i) => i.reason === 'unsupported-composition')).to.equal(true);
  });

  it('returns empty errors and issues for a null schema', () => {
    const result = validateAgainst(null, {});
    expect(result.errorsByPointer).to.deep.equal({});
    expect(result.schemaIssues).to.deep.equal([]);
    expect(result.editable).to.equal(false);
  });

  it('treats undefined data as an empty document', () => {
    const result = validateAgainst(
      {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', title: 'Name' } },
      },
    );
    expect(result.errorsByPointer['/data/name']).to.equal('This field is required.');
  });
});
