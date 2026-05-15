import { expect } from '@esm-bundle/chai';
import {
  addItem,
  insertItem,
  moveItem,
  removeItem,
  setField,
} from '../../../nx/blocks/form/core/mutate.js';

describe('mutate', () => {
  describe('setField', () => {
    it('writes a primitive value', () => {
      const document = { data: {} };
      const node = { kind: 'string' };
      const { document: next, changed } = setField({
        document, pointer: '/data/name', value: 'Alice', node,
      });
      expect(changed).to.equal(true);
      expect(next.data.name).to.equal('Alice');
    });

    it('does not mutate the input document', () => {
      const document = { data: { name: 'old' } };
      const node = { kind: 'string' };
      setField({
        document, pointer: '/data/name', value: 'new', node,
      });
      expect(document.data.name).to.equal('old');
    });

    it('reports changed=false when value is identical', () => {
      const document = { data: { name: 'same' } };
      const node = { kind: 'string' };
      const { changed } = setField({
        document, pointer: '/data/name', value: 'same', node,
      });
      expect(changed).to.equal(false);
    });

    it('clears the field when value is empty string', () => {
      const document = { data: { name: 'Alice' } };
      const node = { kind: 'string' };
      const { document: next, changed } = setField({
        document, pointer: '/data/name', value: '', node,
      });
      expect(changed).to.equal(true);
      expect(next.data).to.not.have.property('name');
    });

    it('treats NaN as a clear', () => {
      const document = { data: { age: 10 } };
      const node = { kind: 'number' };
      const { document: next, changed } = setField({
        document, pointer: '/data/age', value: Number.NaN, node,
      });
      expect(changed).to.equal(true);
      expect(next.data).to.not.have.property('age');
    });

    it('replaces an array element with the kind-specific empty when cleared', () => {
      const document = { data: { items: ['a', 'b', 'c'] } };
      const node = { kind: 'string' };
      const { document: next } = setField({
        document, pointer: '/data/items/1', value: '', node,
      });
      expect(next.data.items).to.deep.equal(['a', '', 'c']);
    });

    it('uses false as the empty value for boolean nodes', () => {
      const document = { data: { items: [true, true, true] } };
      const node = { kind: 'boolean' };
      const { document: next } = setField({
        document, pointer: '/data/items/1', value: null, node,
      });
      expect(next.data.items).to.deep.equal([true, false, true]);
    });
  });

  describe('addItem', () => {
    it('appends an item with the supplied default value', () => {
      const document = { data: { items: ['a'] } };
      const itemDefinition = { kind: 'string', defaultValue: 'NEW' };
      const { document: next, changed } = addItem({
        document, pointer: '/data/items', itemDefinition,
      });
      expect(changed).to.equal(true);
      expect(next.data.items).to.deep.equal(['a', 'NEW']);
    });

    it('creates the array when it does not yet exist', () => {
      const document = { data: {} };
      const itemDefinition = { kind: 'string' };
      const { document: next } = addItem({
        document, pointer: '/data/items', itemDefinition,
      });
      expect(next.data.items).to.deep.equal(['']);
    });

    it('builds an object default with required defaults from children', () => {
      const document = { data: { items: [] } };
      const itemDefinition = {
        kind: 'object',
        children: [
          { key: 'name', kind: 'string', defaultValue: 'Untitled' },
          { key: 'active', kind: 'boolean' },
        ],
      };
      const { document: next } = addItem({
        document, pointer: '/data/items', itemDefinition,
      });
      expect(next.data.items).to.deep.equal([{ name: 'Untitled', active: false }]);
    });

    it('clones the schema default so future mutations cannot leak back', () => {
      const sharedDefault = { tags: [] };
      const itemDefinition = { kind: 'object', defaultValue: sharedDefault };
      const { document: next } = addItem({
        document: { data: { items: [] } },
        pointer: '/data/items',
        itemDefinition,
      });
      next.data.items[0].tags.push('a');
      expect(sharedDefault.tags).to.deep.equal([]);
    });
  });

  describe('insertItem', () => {
    it('inserts before the target pointer', () => {
      const document = { data: { items: ['a', 'b', 'c'] } };
      const itemDefinition = { kind: 'string', defaultValue: 'X' };
      const { document: next, changed } = insertItem({
        document, pointer: '/data/items/1', itemDefinition,
      });
      expect(changed).to.equal(true);
      expect(next.data.items).to.deep.equal(['a', 'X', 'b', 'c']);
    });
  });

  describe('removeItem', () => {
    it('removes an array index', () => {
      const document = { data: { items: ['a', 'b', 'c'] } };
      const { document: next, changed } = removeItem({
        document, pointer: '/data/items/1',
      });
      expect(changed).to.equal(true);
      expect(next.data.items).to.deep.equal(['a', 'c']);
    });

    it('returns changed=false for an out-of-bounds index', () => {
      const document = { data: { items: ['a'] } };
      const { changed } = removeItem({ document, pointer: '/data/items/5' });
      expect(changed).to.equal(false);
    });
  });

  describe('moveItem', () => {
    it('moves an item from one index to another', () => {
      const document = { data: { items: ['a', 'b', 'c'] } };
      const { document: next, changed } = moveItem({
        document, pointer: '/data/items', fromIndex: 0, toIndex: 2,
      });
      expect(changed).to.equal(true);
      expect(next.data.items).to.deep.equal(['b', 'c', 'a']);
    });

    it('is a no-op when from === to', () => {
      const document = { data: { items: ['a', 'b'] } };
      const { changed } = moveItem({
        document, pointer: '/data/items', fromIndex: 0, toIndex: 0,
      });
      expect(changed).to.equal(false);
    });

    it('returns changed=false when the path is not an array', () => {
      const document = { data: { items: 'not-an-array' } };
      const { changed } = moveItem({
        document, pointer: '/data/items', fromIndex: 0, toIndex: 1,
      });
      expect(changed).to.equal(false);
    });
  });
});
