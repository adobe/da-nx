import { expect } from '@esm-bundle/chai';
import { validateDocument } from '../../../nx/blocks/form/core/validation.js';
import { compileSchema } from '../../../nx/blocks/form/core/schema.js';
import { buildModel } from '../../../nx/blocks/form/core/model.js';

function setup(schema, data) {
  const { definition } = compileSchema(schema);
  const document = { metadata: {}, data };
  const model = buildModel({ definition, document });
  return validateDocument({ document, model });
}

describe('validateDocument', () => {
  it('returns no errors for a clean document', () => {
    const { errorsByPointer } = setup(
      { type: 'object', properties: { name: { type: 'string' } } },
      { name: 'ok' },
    );
    expect(errorsByPointer).to.deep.equal({});
  });

  it('reports a missing root /data', () => {
    const schema = { type: 'object', properties: { name: { type: 'string' } } };
    const { definition } = compileSchema(schema);
    const document = { metadata: {} };
    const model = buildModel({ definition, document });
    const { errorsByPointer } = validateDocument({ document, model });
    expect(errorsByPointer['/data']).to.match(/missing/i);
  });

  describe('required', () => {
    it('flags missing required string', () => {
      const { errorsByPointer } = setup(
        { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
        { name: '' },
      );
      expect(errorsByPointer['/data/name']).to.equal('This field is required.');
    });

    it('treats whitespace-only as empty', () => {
      const { errorsByPointer } = setup(
        { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
        { name: '   ' },
      );
      expect(errorsByPointer['/data/name']).to.equal('This field is required.');
    });

    it('flags an empty required array', () => {
      const { errorsByPointer } = setup(
        {
          type: 'object',
          required: ['items'],
          properties: { items: { type: 'array', items: { type: 'string' } } },
        },
        { items: [] },
      );
      expect(errorsByPointer['/data/items']).to.equal('This field is required.');
    });
  });

  describe('string', () => {
    it('rejects minLength under', () => {
      const { errorsByPointer } = setup(
        { type: 'object', properties: { name: { type: 'string', minLength: 3 } } },
        { name: 'ab' },
      );
      expect(errorsByPointer['/data/name']).to.match(/at least 3/);
    });

    it('rejects maxLength over', () => {
      const { errorsByPointer } = setup(
        { type: 'object', properties: { name: { type: 'string', maxLength: 3 } } },
        { name: 'abcd' },
      );
      expect(errorsByPointer['/data/name']).to.match(/at most 3/);
    });

    it('reports an invalid regex pattern', () => {
      const { errorsByPointer } = setup(
        { type: 'object', properties: { code: { type: 'string', pattern: '[' } } },
        { code: 'x' },
      );
      expect(errorsByPointer['/data/code']).to.match(/pattern is invalid/i);
    });

    it('rejects non-matching pattern', () => {
      const { errorsByPointer } = setup(
        { type: 'object', properties: { code: { type: 'string', pattern: '^\\d+$' } } },
        { code: 'abc' },
      );
      expect(errorsByPointer['/data/code']).to.match(/required pattern/);
    });
  });

  describe('number / integer', () => {
    it('rejects below minimum', () => {
      const { errorsByPointer } = setup(
        { type: 'object', properties: { age: { type: 'number', minimum: 5 } } },
        { age: 1 },
      );
      expect(errorsByPointer['/data/age']).to.match(/greater than or equal/);
    });

    it('rejects above maximum', () => {
      const { errorsByPointer } = setup(
        { type: 'object', properties: { age: { type: 'number', maximum: 5 } } },
        { age: 9 },
      );
      expect(errorsByPointer['/data/age']).to.match(/less than or equal/);
    });

    it('rejects a non-integer when type is integer', () => {
      const { errorsByPointer } = setup(
        { type: 'object', properties: { n: { type: 'integer' } } },
        { n: 1.5 },
      );
      expect(errorsByPointer['/data/n']).to.match(/integer/);
    });
  });

  describe('enum', () => {
    it('rejects a value not in enum', () => {
      const { errorsByPointer } = setup(
        { type: 'object', properties: { color: { type: 'string', enum: ['a', 'b'] } } },
        { color: 'x' },
      );
      expect(errorsByPointer['/data/color']).to.match(/allowed options/);
    });

    it('accepts a value in enum', () => {
      const { errorsByPointer } = setup(
        { type: 'object', properties: { color: { type: 'string', enum: ['a', 'b'] } } },
        { color: 'a' },
      );
      expect(errorsByPointer).to.deep.equal({});
    });
  });

  describe('array', () => {
    it('rejects below minItems when the array has content', () => {
      const { errorsByPointer } = setup(
        {
          type: 'object',
          properties: { items: { type: 'array', minItems: 2, items: { type: 'string' } } },
        },
        { items: ['only-one'] },
      );
      expect(errorsByPointer['/data/items']).to.match(/at least 2/);
    });

    it('rejects above maxItems', () => {
      const { errorsByPointer } = setup(
        {
          type: 'object',
          properties: { items: { type: 'array', maxItems: 2, items: { type: 'string' } } },
        },
        { items: ['a', 'b', 'c'] },
      );
      expect(errorsByPointer['/data/items']).to.match(/at most 2/);
    });
  });

  describe('form-empty values treated as absent', () => {
    it('does not fire enum for an unset optional enum field', () => {
      const { errorsByPointer } = setup(
        { type: 'object', properties: { status: { type: 'string', enum: ['Active', 'Done'] } } },
        { status: '' },
      );
      expect(errorsByPointer).to.deep.equal({});
    });

    it('does not fire pattern for a cleared optional string field', () => {
      const { errorsByPointer } = setup(
        { type: 'object', properties: { code: { type: 'string', pattern: '^\\d+$' } } },
        { code: '   ' },
      );
      expect(errorsByPointer).to.deep.equal({});
    });

    it('does not fire minLength for a cleared optional string field', () => {
      const { errorsByPointer } = setup(
        { type: 'object', properties: { name: { type: 'string', minLength: 3 } } },
        { name: '' },
      );
      expect(errorsByPointer).to.deep.equal({});
    });

    it('does not fire minItems for an empty optional array', () => {
      const { errorsByPointer } = setup(
        {
          type: 'object',
          properties: { items: { type: 'array', minItems: 2, items: { type: 'string' } } },
        },
        { items: [] },
      );
      expect(errorsByPointer).to.deep.equal({});
    });
  });

  it('skips unsupported nodes (their values are not validated)', () => {
    const { errorsByPointer } = setup(
      {
        type: 'object',
        properties: { choice: { oneOf: [{ type: 'string' }, { type: 'number' }] } },
      },
      { choice: 'anything' },
    );
    expect(errorsByPointer).to.deep.equal({});
  });
});
