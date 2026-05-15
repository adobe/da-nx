import { expect } from '@esm-bundle/chai';
import {
  appendPointer,
  clearValueAt,
  definitionAt,
  getParentPointer,
  insertValueAt,
  parsePointer,
  removeValueAt,
  setValueAt,
  valueAt,
} from '../../../nx/blocks/form/core/pointer.js';

describe('pointer', () => {
  describe('parsePointer', () => {
    it('returns [] for empty / invalid pointers', () => {
      expect(parsePointer('')).to.deep.equal([]);
      expect(parsePointer('/')).to.deep.equal([]);
      expect(parsePointer(null)).to.deep.equal([]);
      expect(parsePointer(undefined)).to.deep.equal([]);
    });

    it('splits simple pointers', () => {
      expect(parsePointer('/data/name')).to.deep.equal(['data', 'name']);
      expect(parsePointer('/a/b/c')).to.deep.equal(['a', 'b', 'c']);
    });

    it('unescapes ~1 to / and ~0 to ~', () => {
      expect(parsePointer('/a~1b/c~0d')).to.deep.equal(['a/b', 'c~d']);
    });

    it('decodes ~01 in the documented order (~0 then ~1)', () => {
      // RFC 6901: decoding order is ~1 → /, then ~0 → ~
      expect(parsePointer('/~01')).to.deep.equal(['~1']);
    });
  });

  describe('appendPointer', () => {
    it('appends to a non-root pointer', () => {
      expect(appendPointer({ pointer: '/data', segment: 'name' })).to.equal('/data/name');
    });

    it('appends to an empty pointer', () => {
      expect(appendPointer({ pointer: '', segment: 'data' })).to.equal('/data');
    });

    it('escapes / and ~ in segments', () => {
      expect(appendPointer({ pointer: '/data', segment: 'a/b' })).to.equal('/data/a~1b');
      expect(appendPointer({ pointer: '/data', segment: 'a~b' })).to.equal('/data/a~0b');
    });

    it('escapes both characters together in the canonical order', () => {
      // appendPointer should apply ~0 (for ~) before ~1 (for /) so that
      // a literal segment "~1" survives encode→decode round-trip.
      const encoded = appendPointer({ pointer: '', segment: '~1' });
      expect(parsePointer(encoded)).to.deep.equal(['~1']);
    });

    it('coerces numeric segments to strings', () => {
      expect(appendPointer({ pointer: '/data/items', segment: 0 })).to.equal('/data/items/0');
    });
  });

  describe('getParentPointer', () => {
    it('returns parent of a nested pointer', () => {
      expect(getParentPointer('/data/name')).to.equal('/data');
      expect(getParentPointer('/data/items/0')).to.equal('/data/items');
    });

    it('returns empty for one-segment or empty pointers', () => {
      expect(getParentPointer('/data')).to.equal('');
      expect(getParentPointer('')).to.equal('');
    });

    it('preserves escaping in parent segments', () => {
      expect(getParentPointer('/a~1b/c')).to.equal('/a~1b');
    });
  });

  describe('valueAt', () => {
    it('returns nested value', () => {
      const data = { a: { b: { c: 'x' } } };
      expect(valueAt({ data, pointer: '/a/b/c' })).to.equal('x');
    });

    it('returns undefined for missing path (no throw)', () => {
      const data = { a: 1 };
      expect(valueAt({ data, pointer: '/a/b/c' })).to.equal(undefined);
      expect(valueAt({ data, pointer: '/missing' })).to.equal(undefined);
    });

    it('walks array indices', () => {
      const data = { items: [{ name: 'first' }, { name: 'second' }] };
      expect(valueAt({ data, pointer: '/items/1/name' })).to.equal('second');
    });
  });

  describe('setValueAt', () => {
    it('writes a leaf value', () => {
      const data = { a: { b: 1 } };
      const ok = setValueAt({ data, pointer: '/a/b', value: 2 });
      expect(ok).to.equal(true);
      expect(data.a.b).to.equal(2);
    });

    it('creates intermediate objects when missing', () => {
      const data = {};
      setValueAt({ data, pointer: '/a/b/c', value: 'x' });
      expect(data).to.deep.equal({ a: { b: { c: 'x' } } });
    });

    it('creates an intermediate array when the next segment is numeric', () => {
      const data = {};
      setValueAt({ data, pointer: '/items/0', value: 'first' });
      expect(Array.isArray(data.items)).to.equal(true);
      expect(data.items[0]).to.equal('first');
    });

    it('returns false for empty pointer', () => {
      expect(setValueAt({ data: {}, pointer: '', value: 1 })).to.equal(false);
    });
  });

  describe('removeValueAt', () => {
    it('deletes an object key', () => {
      const data = { a: 1, b: 2 };
      const ok = removeValueAt({ data, pointer: '/a' });
      expect(ok).to.equal(true);
      expect(data).to.deep.equal({ b: 2 });
    });

    it('splices an array index', () => {
      const data = { items: ['a', 'b', 'c'] };
      const ok = removeValueAt({ data, pointer: '/items/1' });
      expect(ok).to.equal(true);
      expect(data.items).to.deep.equal(['a', 'c']);
    });

    it('returns false for an out-of-bounds array index', () => {
      const data = { items: ['a'] };
      expect(removeValueAt({ data, pointer: '/items/5' })).to.equal(false);
    });

    it('returns false for a missing object key', () => {
      expect(removeValueAt({ data: { a: 1 }, pointer: '/missing' })).to.equal(false);
    });
  });

  describe('clearValueAt', () => {
    it('replaces an array element with the empty value', () => {
      const data = { items: ['a', 'b', 'c'] };
      const ok = clearValueAt({ data, pointer: '/items/1', emptyValue: '' });
      expect(ok).to.equal(true);
      expect(data.items).to.deep.equal(['a', '', 'c']);
    });

    it('deletes an object key (falls back to removeValueAt)', () => {
      const data = { a: 1 };
      clearValueAt({ data, pointer: '/a', emptyValue: '' });
      expect(data).to.deep.equal({});
    });
  });

  describe('insertValueAt', () => {
    it('inserts before the given index', () => {
      const data = { items: ['a', 'b', 'c'] };
      const ok = insertValueAt({ data, pointer: '/items/1', value: 'NEW' });
      expect(ok).to.equal(true);
      expect(data.items).to.deep.equal(['a', 'NEW', 'b', 'c']);
    });

    it('clamps to array length when the index is past the end', () => {
      const data = { items: ['a'] };
      insertValueAt({ data, pointer: '/items/10', value: 'X' });
      expect(data.items).to.deep.equal(['a', 'X']);
    });

    it('returns false for an empty parent pointer', () => {
      expect(insertValueAt({ data: {}, pointer: '/0', value: 'x' })).to.equal(false);
    });
  });

  describe('definitionAt', () => {
    const definition = {
      key: 'data',
      kind: 'object',
      children: [
        {
          key: 'name', kind: 'string',
        },
        {
          key: 'items',
          kind: 'array',
          item: {
            key: 'item',
            kind: 'object',
            children: [{ key: 'label', kind: 'string' }],
          },
        },
      ],
    };

    it('finds a top-level field', () => {
      const node = definitionAt({ definition, pointer: '/data/name' });
      expect(node?.key).to.equal('name');
    });

    it('finds an array item definition by following array → item', () => {
      const node = definitionAt({ definition, pointer: '/data/items/0' });
      expect(node?.kind).to.equal('object');
    });

    it('finds a nested field inside an array item', () => {
      const node = definitionAt({ definition, pointer: '/data/items/0/label' });
      expect(node?.key).to.equal('label');
    });

    it('returns null for unknown segments', () => {
      expect(definitionAt({ definition, pointer: '/data/missing' })).to.equal(null);
    });

    it('returns null when pointer does not begin with /data', () => {
      expect(definitionAt({ definition, pointer: '/other' })).to.equal(null);
    });
  });
});
