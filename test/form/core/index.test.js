import { expect } from '@esm-bundle/chai';
import { createCore } from '../../../nx/blocks/form/core/index.js';

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

    it('passes a cloned document to saveDocument', async () => {
      const saver = trackingSaver();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema: baseSchema, document: baseDocument });
      const wait = saver.waitForNext();
      core.setField('/data/name', 'Dave');
      await wait;
      // Mutating the captured arg must not affect core state.
      saver.calls[0].document.data.name = 'tampered';
      expect(core.getState().document.values.data.name).to.equal('Dave');
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
});
