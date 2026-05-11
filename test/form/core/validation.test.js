import { expect } from '@esm-bundle/chai';
import { validateDocument } from '../../../nx/blocks/form/core/validation.js';

function modelFor(root) {
  const byPointer = new Map();
  const walk = (node) => {
    if (!node) return;
    byPointer.set(node.pointer, node);
    (node.children ?? []).forEach(walk);
    (node.items ?? []).forEach(walk);
  };
  walk(root);
  return { root, byPointer };
}

function field({
  pointer = '/data/x', kind = 'string', value, required = false, validation = {}, enumValues,
}) {
  return {
    pointer, kind, value, required, validation, enumValues,
  };
}

function rootNode(children = []) {
  return {
    pointer: '/data', kind: 'object', value: {}, children,
  };
}

describe('validateDocument', () => {
  it('returns no errors for a clean document', () => {
    const model = modelFor(rootNode([field({ value: 'ok' })]));
    const { errorsByPointer } = validateDocument({ document: { data: {} }, model });
    expect(errorsByPointer).to.deep.equal({});
  });

  describe('required', () => {
    it('flags missing required string', () => {
      const model = modelFor(rootNode([field({ value: '', required: true })]));
      const { errorsByPointer } = validateDocument({ document: { data: {} }, model });
      expect(errorsByPointer['/data/x']).to.match(/required/i);
    });

    it('treats whitespace-only as empty', () => {
      const model = modelFor(rootNode([field({ value: '   ', required: true })]));
      const { errorsByPointer } = validateDocument({ document: { data: {} }, model });
      expect(errorsByPointer['/data/x']).to.match(/required/i);
    });

    it('flags an empty required array', () => {
      const arr = {
        pointer: '/data/items', kind: 'array', value: [], required: true, items: [],
      };
      const model = modelFor(rootNode([arr]));
      const { errorsByPointer } = validateDocument({ document: { data: {} }, model });
      expect(errorsByPointer['/data/items']).to.match(/required/i);
    });
  });

  describe('string rules', () => {
    it('rejects minLength under', () => {
      const model = modelFor(rootNode([field({ value: 'ab', validation: { minLength: 3 } })]));
      const { errorsByPointer } = validateDocument({ document: { data: {} }, model });
      expect(errorsByPointer['/data/x']).to.match(/at least 3/);
    });

    it('rejects maxLength over', () => {
      const model = modelFor(rootNode([field({ value: 'abcd', validation: { maxLength: 3 } })]));
      const { errorsByPointer } = validateDocument({ document: { data: {} }, model });
      expect(errorsByPointer['/data/x']).to.match(/at most 3/);
    });

    it('reports an invalid regex pattern as a schema error', () => {
      const model = modelFor(rootNode([field({ value: 'x', validation: { pattern: '[' } })]));
      const { errorsByPointer } = validateDocument({ document: { data: {} }, model });
      expect(errorsByPointer['/data/x']).to.match(/pattern is invalid/i);
    });

    it('rejects non-matching pattern', () => {
      const model = modelFor(rootNode([field({ value: 'abc', validation: { pattern: '^\\d+$' } })]));
      const { errorsByPointer } = validateDocument({ document: { data: {} }, model });
      expect(errorsByPointer['/data/x']).to.match(/required format/);
    });
  });

  describe('number rules', () => {
    it('rejects below minimum', () => {
      const model = modelFor(rootNode([field({
        kind: 'number', value: 1, validation: { minimum: 5 },
      })]));
      const { errorsByPointer } = validateDocument({ document: { data: {} }, model });
      expect(errorsByPointer['/data/x']).to.match(/greater than or equal/);
    });

    it('rejects above exclusiveMaximum', () => {
      const model = modelFor(rootNode([field({
        kind: 'number', value: 5, validation: { exclusiveMaximum: 5 },
      })]));
      const { errorsByPointer } = validateDocument({ document: { data: {} }, model });
      expect(errorsByPointer['/data/x']).to.match(/less than 5/);
    });

    it('rejects a non-integer when kind is integer', () => {
      const model = modelFor(rootNode([field({ kind: 'integer', value: 1.5 })]));
      const { errorsByPointer } = validateDocument({ document: { data: {} }, model });
      expect(errorsByPointer['/data/x']).to.match(/integer/);
    });
  });

  describe('enum', () => {
    it('rejects a value not in enum', () => {
      const model = modelFor(rootNode([field({ value: 'x', enumValues: ['a', 'b'] })]));
      const { errorsByPointer } = validateDocument({ document: { data: {} }, model });
      expect(errorsByPointer['/data/x']).to.match(/allowed options/);
    });

    it('accepts a value in enum', () => {
      const model = modelFor(rootNode([field({ value: 'a', enumValues: ['a', 'b'] })]));
      const { errorsByPointer } = validateDocument({ document: { data: {} }, model });
      expect(errorsByPointer).to.deep.equal({});
    });
  });

  describe('array shape', () => {
    it('rejects below minItems', () => {
      const arr = {
        pointer: '/data/items', kind: 'array', value: [], minItems: 1, items: [],
      };
      const model = modelFor(rootNode([arr]));
      const { errorsByPointer } = validateDocument({ document: { data: {} }, model });
      expect(errorsByPointer['/data/items']).to.match(/at least 1/);
    });

    it('rejects above maxItems', () => {
      const arr = {
        pointer: '/data/items', kind: 'array', value: ['a', 'b', 'c'], maxItems: 2, items: [],
      };
      const model = modelFor(rootNode([arr]));
      const { errorsByPointer } = validateDocument({ document: { data: {} }, model });
      expect(errorsByPointer['/data/items']).to.match(/at most 2/);
    });
  });

  it('flags unsupported nodes', () => {
    const node = {
      pointer: '/data/x', kind: 'unsupported', value: undefined, unsupported: {},
    };
    const model = modelFor(rootNode([node]));
    const { errorsByPointer } = validateDocument({ document: { data: {} }, model });
    expect(errorsByPointer['/data/x']).to.match(/unsupported/i);
  });

  it('reports a missing root /data', () => {
    const model = modelFor(rootNode());
    const { errorsByPointer } = validateDocument({ document: {}, model });
    expect(errorsByPointer['/data']).to.match(/missing/i);
  });
});
