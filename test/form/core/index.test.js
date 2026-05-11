import { expect } from '@esm-bundle/chai';
import {
  createCore,
  isDataEmpty,
  materializeDefaults,
} from '../../../nx/blocks/form/core/index.js';
import { compileSchema } from '../../../nx/blocks/form/core/schema.js';
import { serialize } from '../../../nx/blocks/form/app/serialize.js';

function trackingSaver() {
  const calls = [];
  let resolveNext;
  const saveDocument = async (payload) => {
    calls.push(payload);
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r();
    }
    return { ok: true };
  };
  saveDocument.calls = calls;
  saveDocument.waitForNext = () => new Promise((r) => { resolveNext = r; });
  return saveDocument;
}

const baseSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    items: { type: 'array', items: { type: 'string' } },
  },
};

const baseDocument = {
  metadata: { schemaName: 'x' },
  data: { name: 'Alice', items: ['a', 'b'] },
};

describe('createCore', () => {
  describe('load', () => {
    it('returns a state with model, document, and empty errors for a valid input', async () => {
      const core = createCore({ path: '/test.html', saveDocument: trackingSaver() });
      const state = await core.load({ schema: baseSchema, document: baseDocument });

      expect(state.model.root).to.exist;
      expect(state.document.values.data.name).to.equal('Alice');
      expect(state.validation.errorsByPointer).to.deep.equal({});
    });

    it('preserves document.values but leaves model=null for an unsupported schema', async () => {
      const core = createCore({ saveDocument: trackingSaver() });
      const state = await core.load({
        schema: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        document: baseDocument,
      });
      expect(state.model).to.equal(null);
      expect(state.document.values.data.name).to.equal('Alice');
    });

    it('handles a malformed document without throwing', async () => {
      const core = createCore({ saveDocument: trackingSaver() });
      const state = await core.load({ schema: baseSchema, document: null });
      expect(state.model).to.equal(null);
    });

    it('does not call saveDocument on load', async () => {
      const saver = trackingSaver();
      const core = createCore({ path: '/test.html', saveDocument: saver });
      await core.load({ schema: baseSchema, document: baseDocument });
      expect(saver.calls).to.have.lengthOf(0);
    });
  });

  describe('setField', () => {
    it('persists the new document', async () => {
      const saver = trackingSaver();
      const core = createCore({ path: '/test.html', saveDocument: saver });
      await core.load({ schema: baseSchema, document: baseDocument });
      const wait = saver.waitForNext();

      core.setField('/data/name', 'Bob');

      await wait;
      expect(saver.calls).to.have.lengthOf(1);
      expect(saver.calls[0].path).to.equal('/test.html');
      expect(saver.calls[0].document.data.name).to.equal('Bob');
    });

    it('does not call saveDocument when value is unchanged', async () => {
      const saver = trackingSaver();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema: baseSchema, document: baseDocument });
      core.setField('/data/name', 'Alice'); // same value
      // Flush microtasks just in case
      await Promise.resolve();
      expect(saver.calls).to.have.lengthOf(0);
    });

    it('exposes the new value in the next state snapshot', async () => {
      const core = createCore({ saveDocument: trackingSaver() });
      await core.load({ schema: baseSchema, document: baseDocument });
      const next = core.setField('/data/name', 'Carol');
      expect(next.document.values.data.name).to.equal('Carol');
      expect(core.getState().document.values.data.name).to.equal('Carol');
    });

    it('does not throw when called before load', () => {
      const core = createCore({ saveDocument: trackingSaver() });
      const state = core.setField('/data/name', 'x');
      // Returns the empty state — guard works.
      expect(state.model).to.equal(null);
    });

    it('hands saveDocument the post-mutation document', async () => {
      const saver = trackingSaver();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema: baseSchema, document: baseDocument });
      const wait = saver.waitForNext();
      core.setField('/data/name', 'Dave');
      await wait;
      expect(saver.calls[0].document.data.name).to.equal('Dave');
      // Contract: saveDocument must not mutate the input. Core does not defend.
    });
  });

  describe('array operations', () => {
    it('addItem appends a default-valued item and persists', async () => {
      const saver = trackingSaver();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema: baseSchema, document: baseDocument });
      const wait = saver.waitForNext();
      const next = core.addItem('/data/items');
      await wait;
      expect(next.document.values.data.items).to.deep.equal(['a', 'b', '']);
      expect(saver.calls).to.have.lengthOf(1);
    });

    it('insertItem inserts before the pointer and persists', async () => {
      const core = createCore({ saveDocument: trackingSaver() });
      await core.load({ schema: baseSchema, document: baseDocument });
      const next = core.insertItem('/data/items/1');
      expect(next.document.values.data.items).to.deep.equal(['a', '', 'b']);
    });

    it('removeItem respects minItems', async () => {
      const schema = {
        type: 'object',
        properties: {
          items: { type: 'array', minItems: 2, items: { type: 'string' } },
        },
      };
      const core = createCore({ saveDocument: trackingSaver() });
      await core.load({ schema, document: { metadata: {}, data: { items: ['a', 'b'] } } });
      core.removeItem('/data/items/0');
      // unchanged because removal would violate minItems
      expect(core.getState().document.values.data.items).to.deep.equal(['a', 'b']);
    });

    it('addItem respects maxItems', async () => {
      const schema = {
        type: 'object',
        properties: {
          items: { type: 'array', maxItems: 2, items: { type: 'string' } },
        },
      };
      const core = createCore({ saveDocument: trackingSaver() });
      await core.load({ schema, document: { metadata: {}, data: { items: ['a', 'b'] } } });
      core.addItem('/data/items');
      expect(core.getState().document.values.data.items).to.have.lengthOf(2);
    });

    it('moveItem reorders and persists', async () => {
      const saver = trackingSaver();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema: baseSchema, document: baseDocument });
      const wait = saver.waitForNext();
      const next = core.moveItem('/data/items', 0, 1);
      await wait;
      expect(next.document.values.data.items).to.deep.equal(['b', 'a']);
    });

    it('moveItem with from===to is a no-op (no save)', async () => {
      const saver = trackingSaver();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema: baseSchema, document: baseDocument });
      core.moveItem('/data/items', 0, 0);
      await Promise.resolve();
      expect(saver.calls).to.have.lengthOf(0);
    });
  });

  describe('defaults materialization', () => {
    // Schema with defaults at multiple positions, plus a field without a
    // default. Used across the scenarios below.
    const schemaWithDefaults = {
      type: 'object',
      properties: {
        a: { type: 'string', default: 'X' },
        b: { type: 'string', default: 'Y' },
        c: { type: 'string' },
      },
    };

    it('writes schema defaults into data when the loaded document is empty', async () => {
      const core = createCore({ saveDocument: trackingSaver() });
      const state = await core.load({
        schema: schemaWithDefaults,
        document: { metadata: { schemaName: 'x' }, data: {} },
      });
      expect(state.document.values.data).to.deep.equal({ a: 'X', b: 'Y' });
    });

    it('writes defaults when the loaded data is recursively empty', async () => {
      const core = createCore({ saveDocument: trackingSaver() });
      const state = await core.load({
        schema: schemaWithDefaults,
        // All leaves prune to nothing — treated identically to {}.
        document: { metadata: { schemaName: 'x' }, data: { a: '', b: null } },
      });
      expect(state.document.values.data).to.deep.equal({ a: 'X', b: 'Y' });
    });

    it('does not materialize on a non-empty document — missing keys stay missing', async () => {
      const core = createCore({ saveDocument: trackingSaver() });
      const state = await core.load({
        schema: schemaWithDefaults,
        document: { metadata: { schemaName: 'x' }, data: { a: 'Alice' } },
      });
      expect(state.document.values.data).to.deep.equal({ a: 'Alice' });
    });

    it('persists defaults on the first mutation even when the user only touches another field', async () => {
      // The bug this guards against: the user edits one field on a fresh
      // document; the save must include the materialized defaults of all
      // other fields, not just the typed one.
      const saver = trackingSaver();
      const core = createCore({ saveDocument: saver });
      await core.load({
        schema: schemaWithDefaults,
        document: { metadata: { schemaName: 'x' }, data: {} },
      });
      const wait = saver.waitForNext();
      core.setField('/data/c', 'Z');
      await wait;
      expect(saver.calls[0].document.data).to.deep.equal({ a: 'X', b: 'Y', c: 'Z' });
    });

    it('does not save anything when a fresh document is loaded but never mutated', async () => {
      const saver = trackingSaver();
      const core = createCore({ saveDocument: saver });
      await core.load({
        schema: schemaWithDefaults,
        document: { metadata: { schemaName: 'x' }, data: {} },
      });
      await Promise.resolve();
      expect(saver.calls).to.have.lengthOf(0);
    });

    it('leaves data empty when the schema has no defaults', async () => {
      const core = createCore({ saveDocument: trackingSaver() });
      const state = await core.load({
        schema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
        document: { metadata: { schemaName: 'x' }, data: {} },
      });
      expect(state.document.values.data).to.deep.equal({});
    });

    it('clearing a materialized default removes the key from the document', async () => {
      const core = createCore({ saveDocument: trackingSaver() });
      await core.load({
        schema: schemaWithDefaults,
        document: { metadata: { schemaName: 'x' }, data: {} },
      });
      const next = core.setField('/data/a', '');
      expect(next.document.values.data).to.deep.equal({ b: 'Y' });
    });

    it('does not re-materialize when the user mutates a fresh document', async () => {
      // Materialization happens exactly once per load. A later mutation must
      // not bring back a default that the user just cleared.
      const core = createCore({ saveDocument: trackingSaver() });
      await core.load({
        schema: schemaWithDefaults,
        document: { metadata: { schemaName: 'x' }, data: {} },
      });
      core.setField('/data/a', '');
      const next = core.setField('/data/c', 'Z');
      expect(next.document.values.data).to.deep.equal({ b: 'Y', c: 'Z' });
    });

    it('materializes nested object defaults', async () => {
      const schema = {
        type: 'object',
        properties: {
          outer: {
            type: 'object',
            properties: {
              inner: { type: 'string', default: 'nested' },
            },
          },
        },
      };
      const core = createCore({ saveDocument: trackingSaver() });
      const state = await core.load({
        schema,
        document: { metadata: { schemaName: 'x' }, data: {} },
      });
      expect(state.document.values.data).to.deep.equal({ outer: { inner: 'nested' } });
    });

    it('leaves arrays empty even when items have a default', async () => {
      // Fabricating array items is the job of `addItem`, not load.
      const schema = {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'string', default: 'X' } },
        },
      };
      const core = createCore({ saveDocument: trackingSaver() });
      const state = await core.load({
        schema,
        document: { metadata: { schemaName: 'x' }, data: {} },
      });
      expect(state.document.values.data).to.deep.equal({});
    });

    it('materializes a boolean without an explicit default as false', async () => {
      const schema = {
        type: 'object',
        properties: { flag: { type: 'boolean' } },
      };
      const core = createCore({ saveDocument: trackingSaver() });
      const state = await core.load({
        schema,
        document: { metadata: { schemaName: 'x' }, data: {} },
      });
      expect(state.document.values.data).to.deep.equal({ flag: false });
    });

    it('respects an explicit boolean default of true', async () => {
      const schema = {
        type: 'object',
        properties: { flag: { type: 'boolean', default: true } },
      };
      const core = createCore({ saveDocument: trackingSaver() });
      const state = await core.load({
        schema,
        document: { metadata: { schemaName: 'x' }, data: {} },
      });
      expect(state.document.values.data).to.deep.equal({ flag: true });
    });

    it('materializes nested booleans inside objects', async () => {
      const schema = {
        type: 'object',
        properties: {
          outer: {
            type: 'object',
            properties: { flag: { type: 'boolean' } },
          },
        },
      };
      const core = createCore({ saveDocument: trackingSaver() });
      const state = await core.load({
        schema,
        document: { metadata: { schemaName: 'x' }, data: {} },
      });
      expect(state.document.values.data).to.deep.equal({ outer: { flag: false } });
    });

    it('saves an unchanged false boolean alongside a typed field on first mutation', async () => {
      // Regression coverage for the original bug, applied to booleans: an
      // implicit-false checkbox the user never touched must still be saved.
      const schema = {
        type: 'object',
        properties: {
          flag: { type: 'boolean' },
          name: { type: 'string' },
        },
      };
      const saver = trackingSaver();
      const core = createCore({ saveDocument: saver });
      await core.load({
        schema,
        document: { metadata: { schemaName: 'x' }, data: {} },
      });
      const wait = saver.waitForNext();
      core.setField('/data/name', 'Alice');
      await wait;
      expect(saver.calls[0].document.data).to.deep.equal({ flag: false, name: 'Alice' });
    });

    it('exposes a saved enum value on node.value (drives select render)', async () => {
      // Regression coverage for the select-on-reload bug: after loading a
      // previously-saved document that picked an enum value, the model node
      // for that field must carry the value so the renderer can mark the
      // matching option as selected.
      const schema = {
        type: 'object',
        properties: { status: { type: 'string', enum: ['active', 'inactive'] } },
      };
      const core = createCore({ saveDocument: trackingSaver() });
      const state = await core.load({
        schema,
        document: { metadata: { schemaName: 'x' }, data: { status: 'active' } },
      });
      const node = state.model.byPointer.get('/data/status');
      expect(node.value).to.equal('active');
      expect(node.enumValues).to.deep.equal(['active', 'inactive']);
    });

    it('reload of a saved {flag: false} stays unchecked (not re-materialized)', async () => {
      // Symmetry: `false` is non-empty, so the doc is non-fresh on reload and
      // the boolean reflects the saved state — including when that state is
      // false. No re-materialization occurs.
      const schema = {
        type: 'object',
        properties: { flag: { type: 'boolean', default: true } },
      };
      const core = createCore({ saveDocument: trackingSaver() });
      const state = await core.load({
        schema,
        // Previously saved as false — user unchecked a default-true checkbox.
        document: { metadata: { schemaName: 'x' }, data: { flag: false } },
      });
      expect(state.document.values.data).to.deep.equal({ flag: false });
    });
  });

  describe('materializeDefaults (unit)', () => {
    it('returns undefined for a definition with no defaults anywhere', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: { name: { type: 'string' } },
      });
      expect(materializeDefaults(definition)).to.equal(undefined);
    });

    it('returns only keys that carry a default (siblings without a default are omitted)', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: {
          a: { type: 'string', default: 'X' },
          b: { type: 'string' },
        },
      });
      expect(materializeDefaults(definition)).to.deep.equal({ a: 'X' });
    });

    it('deep-clones the default so mutating the result cannot poison the schema', () => {
      const { definition } = compileSchema({
        type: 'object',
        properties: {
          obj: { type: 'object', default: { nested: 'V' } },
        },
      });
      const result = materializeDefaults(definition);
      result.obj.nested = 'tampered';
      const fresh = materializeDefaults(definition);
      expect(fresh.obj.nested).to.equal('V');
    });

    it('returns false for a bare boolean definition without an explicit default', () => {
      const { definition } = compileSchema({ type: 'boolean' });
      expect(materializeDefaults(definition)).to.equal(false);
    });

    it('returns the schema default for a boolean when one is set', () => {
      const { definition } = compileSchema({ type: 'boolean', default: true });
      expect(materializeDefaults(definition)).to.equal(true);
    });
  });

  describe('isDataEmpty / prune symmetry', () => {
    // Critical invariant: a value the loader considers "empty" must also be
    // a value the serializer would prune from the saved HTML. If these two
    // ever drift, a doc could load as "fresh" yet save with content (or vice
    // versa), reintroducing the defaults-overwrite bug.
    function prunesToNothing(data) {
      const { html } = serialize({ json: { metadata: { schemaName: 'x' }, data } });
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const block = doc.querySelector('.x');
      return !block || block.textContent.trim() === '';
    }

    const inputs = [
      {},
      { a: '' },
      { a: '   ' },
      { a: null },
      { a: undefined },
      { a: [] },
      { a: {} },
      { a: { b: '' } },
      { a: [{ b: '' }, ''] },
      { a: { b: { c: [] } } },
    ];

    inputs.forEach((input, i) => {
      it(`agrees with prune on case ${i}`, () => {
        expect(isDataEmpty(input)).to.equal(prunesToNothing(input));
      });
    });

    it('disagrees (correctly) when any leaf has content', () => {
      expect(isDataEmpty({ a: 'x' })).to.equal(false);
      expect(prunesToNothing({ a: 'x' })).to.equal(false);
    });
  });
});
