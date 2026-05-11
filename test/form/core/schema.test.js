import { expect } from '@esm-bundle/chai';
import { compileSchema } from '../../../nx/blocks/form/core/schema.js';

describe('compileSchema', () => {
  describe('basic types', () => {
    it('compiles a simple object schema', () => {
      const { definition, editable } = compileSchema({
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
          age: { type: 'integer' },
        },
      });

      expect(editable).to.equal(true);
      expect(definition.kind).to.equal('object');
      expect(definition.children).to.have.lengthOf(2);
      expect(definition.children[0]).to.include({ key: 'name', kind: 'string', label: 'Name' });
      expect(definition.children[1]).to.include({ key: 'age', kind: 'integer' });
    });

    it('marks fields listed in required', () => {
      const { definition } = compileSchema({
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
      });
      expect(definition.children.find((c) => c.key === 'name').required).to.equal(true);
      expect(definition.children.find((c) => c.key === 'age').required).to.equal(false);
    });

    it('compiles an array with an item schema', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: {
          tags: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
        },
      });
      const tags = definition.children[0];
      expect(tags.kind).to.equal('array');
      expect(tags.minItems).to.equal(1);
      expect(tags.maxItems).to.equal(5);
      expect(tags.item.kind).to.equal('string');
    });

    it('treats enum as a string with enumValues', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { color: { enum: ['red', 'green'] } },
      });
      const color = definition.children[0];
      expect(color.kind).to.equal('string');
      expect(color.enumValues).to.deep.equal(['red', 'green']);
    });

    it('honours readOnly', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { id: { type: 'string', readOnly: true } },
      });
      expect(definition.children[0].readonly).to.equal(true);
    });

    it('picks up default values', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { name: { type: 'string', default: 'Untitled' } },
      });
      expect(definition.children[0].defaultValue).to.equal('Untitled');
    });
  });

  describe('$ref', () => {
    it('resolves an internal $ref', () => {
      const { definition, editable } = compileSchema({
        type: 'object',
        $defs: {
          Address: {
            type: 'object',
            properties: { street: { type: 'string' } },
          },
        },
        properties: {
          home: { $ref: '#/$defs/Address' },
        },
      });
      expect(editable).to.equal(true);
      const home = definition.children[0];
      expect(home.kind).to.equal('object');
      expect(home.children[0].key).to.equal('street');
    });

    it('terminates on cyclic refs without throwing', () => {
      const { definition } = compileSchema({
        type: 'object',
        $defs: {
          Node: {
            type: 'object',
            properties: { next: { $ref: '#/$defs/Node' } },
          },
        },
        properties: { head: { $ref: '#/$defs/Node' } },
      });
      // The second-level dereference is broken intentionally; we just want no infinite loop.
      expect(definition).to.exist;
      expect(definition.kind).to.equal('object');
    });
  });

  describe('compositions', () => {
    it('inlines a single-entry allOf', () => {
      const { definition, editable } = compileSchema({
        type: 'object',
        properties: {
          x: {
            allOf: [{ type: 'string', minLength: 3 }],
          },
        },
      });
      expect(editable).to.equal(true);
      const x = definition.children[0];
      expect(x.kind).to.equal('string');
      expect(x.validation.minLength).to.equal(3);
    });

    it('marks oneOf as unsupported (whole form non-editable)', () => {
      const { definition, editable, issues } = compileSchema({
        type: 'object',
        properties: {
          x: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        },
      });
      expect(editable).to.equal(false);
      expect(issues.some((i) => i.compositionKeyword === 'oneOf')).to.equal(true);
      // sub-tree unsupported, root definition still exists
      expect(definition).to.exist;
    });

    it('marks anyOf as unsupported', () => {
      const { editable, issues } = compileSchema({
        type: 'object',
        properties: { x: { anyOf: [{ type: 'string' }, { type: 'number' }] } },
      });
      expect(editable).to.equal(false);
      expect(issues.some((i) => i.compositionKeyword === 'anyOf')).to.equal(true);
    });

    it('marks multi-entry allOf as unsupported', () => {
      const { editable, issues } = compileSchema({
        type: 'object',
        properties: { x: { allOf: [{ type: 'string' }, { minLength: 3 }] } },
      });
      expect(editable).to.equal(false);
      expect(issues.some((i) => i.compositionKeyword === 'allOf')).to.equal(true);
    });
  });

  describe('empty / unsupported root', () => {
    it('returns null definition for null schema', () => {
      const result = compileSchema(null);
      expect(result.definition).to.equal(null);
      expect(result.editable).to.equal(false);
    });

    it('returns definition=null when the root itself is unsupported', () => {
      const result = compileSchema({ oneOf: [{ type: 'string' }, { type: 'number' }] });
      expect(result.definition).to.equal(null);
      expect(result.editable).to.equal(false);
    });
  });
});
