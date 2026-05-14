import { expect } from '@esm-bundle/chai';
import {
  createCore,
  coerceData,
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

    it('builds a model with an unsupported root node when the root schema uses only unsupported composition', async () => {
      // An unsupported root (no direct properties) still produces a model so
      // the editor can render an inline "unsupported schema definition" message
      // rather than blocking the entire editor.
      const core = createCore({ saveDocument: trackingSaver() });
      const state = await core.load({
        schema: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        document: baseDocument,
      });
      expect(state.model).to.exist;
      expect(state.model.root.kind).to.equal('unsupported');
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

  describe('coerceData (unit)', () => {
    function compile(schema) {
      return compileSchema(schema).definition;
    }

    it('casts string-encoded integers in an array to numbers', () => {
      const def = compile({
        type: 'object',
        properties: {
          priorities: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 5 } },
        },
      });
      const out = coerceData({ priorities: ['1', '2', '3'] }, def);
      expect(out.priorities).to.deep.equal([1, 2, 3]);
      out.priorities.forEach((v) => expect(typeof v).to.equal('number'));
    });

    it('casts a top-level string-encoded number to a number', () => {
      const def = compile({
        type: 'object',
        properties: { age: { type: 'number' } },
      });
      expect(coerceData({ age: '42' }, def)).to.deep.equal({ age: 42 });
    });

    it('passes through un-coercible numeric strings so the validator can flag them', () => {
      const def = compile({
        type: 'object',
        properties: { age: { type: 'integer' } },
      });
      expect(coerceData({ age: 'abc' }, def)).to.deep.equal({ age: 'abc' });
    });

    it('casts string-encoded booleans to booleans', () => {
      const def = compile({
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          flags: { type: 'array', items: { type: 'boolean' } },
        },
      });
      const out = coerceData({ enabled: 'true', flags: ['true', 'false'] }, def);
      expect(out).to.deep.equal({ enabled: true, flags: [true, false] });
    });

    it('stringifies a number when the schema declares string (heuristic typing was wrong)', () => {
      const def = compile({
        type: 'object',
        properties: { code: { type: 'string' } },
      });
      expect(coerceData({ code: 42 }, def)).to.deep.equal({ code: '42' });
    });

    it('recurses into objects nested inside arrays', () => {
      const def = compile({
        type: 'object',
        properties: {
          people: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                age: { type: 'integer' },
                active: { type: 'boolean' },
              },
            },
          },
        },
      });
      const out = coerceData(
        { people: [{ age: '30', active: 'true' }, { age: '40', active: 'false' }] },
        def,
      );
      expect(out.people).to.deep.equal([
        { age: 30, active: true },
        { age: 40, active: false },
      ]);
    });

    it('leaves keys that the schema does not mention untouched', () => {
      const def = compile({
        type: 'object',
        properties: { age: { type: 'integer' } },
      });
      const out = coerceData({ age: '5', extra: '99' }, def);
      expect(out).to.deep.equal({ age: 5, extra: '99' });
    });

    it('passes through null and undefined values', () => {
      const def = compile({
        type: 'object',
        properties: {
          a: { type: 'integer' },
          b: { type: 'string' },
        },
      });
      expect(coerceData({ a: null, b: undefined }, def))
        .to.deep.equal({ a: null, b: undefined });
    });

    it('returns the value untouched when no definition is provided', () => {
      expect(coerceData({ a: '1' }, null)).to.deep.equal({ a: '1' });
    });

    it('leaves an array value alone when the schema says scalar (no crash)', () => {
      const def = compile({
        type: 'object',
        properties: { name: { type: 'string' } },
      });
      // Schema mismatch: array provided where string declared. Pass through so
      // the validator can produce a single clear error rather than coercing
      // into something the user did not intend.
      expect(coerceData({ name: ['a', 'b'] }, def)).to.deep.equal({ name: ['a', 'b'] });
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

  describe('saveStatus + single-flight persistence', () => {
    // Controllable saver: each call awaits a promise the test resolves
    // explicitly. Lets us pin a save mid-flight and inspect interim state.
    function controlledSaver({ failures = 0, throwsAt = -1 } = {}) {
      const calls = [];
      const resolvers = [];
      let callCount = 0;
      const saveDocument = async (payload) => {
        const seq = callCount;
        callCount += 1;
        calls.push(payload);
        await new Promise((r) => { resolvers.push(r); });
        if (seq === throwsAt) throw new Error('boom');
        if (seq < failures) return { error: 'transient' };
        return { ok: true };
      };
      saveDocument.calls = calls;
      saveDocument.resolveNext = () => {
        const r = resolvers.shift();
        if (r) r();
      };
      saveDocument.inFlightCount = () => resolvers.length;
      return saveDocument;
    }

    it('starts at idle and transitions to saving then saved on a clean save', async () => {
      const saver = controlledSaver();
      const seen = [];
      const core = createCore({
        saveDocument: saver,
        onChange: () => seen.push(core.getState().saveStatus),
      });
      await core.load({ schema: baseSchema, document: baseDocument });
      expect(core.getState().saveStatus).to.equal('idle');

      core.setField('/data/name', 'Bob');
      // Synchronously after setField, persist() has entered its body and
      // flipped state to 'saving' before the first await.
      expect(core.getState().saveStatus).to.equal('saving');

      saver.resolveNext();
      // Yield to microtasks so the save promise settles.
      await Promise.resolve();
      await Promise.resolve();
      expect(core.getState().saveStatus).to.equal('saved');
      expect(seen).to.include('saving');
      expect(seen).to.include('saved');
    });

    it('marks saveStatus error when saveDocument returns an { error } result', async () => {
      const saver = controlledSaver({ failures: 1 });
      const core = createCore({ saveDocument: saver });
      await core.load({ schema: baseSchema, document: baseDocument });
      core.setField('/data/name', 'Bob');
      saver.resolveNext();
      await Promise.resolve();
      await Promise.resolve();
      expect(core.getState().saveStatus).to.equal('error');
    });

    it('marks saveStatus error when saveDocument throws', async () => {
      const saver = controlledSaver({ throwsAt: 0 });
      const core = createCore({ saveDocument: saver });
      await core.load({ schema: baseSchema, document: baseDocument });
      core.setField('/data/name', 'Bob');
      saver.resolveNext();
      await Promise.resolve();
      await Promise.resolve();
      expect(core.getState().saveStatus).to.equal('error');
    });

    it('single-flight: a second mutation during an in-flight save does NOT fire a parallel save', async () => {
      const saver = controlledSaver();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema: baseSchema, document: baseDocument });

      core.setField('/data/name', 'A');
      expect(saver.inFlightCount()).to.equal(1);

      core.setField('/data/name', 'B');
      expect(saver.inFlightCount()).to.equal(1); // still just one

      saver.resolveNext();
      await Promise.resolve(); await Promise.resolve();

      // After the first completes, the queued one starts.
      expect(saver.inFlightCount()).to.equal(1);
      expect(saver.calls).to.have.lengthOf(2);
      expect(saver.calls[1].document.data.name).to.equal('B');

      saver.resolveNext();
      await Promise.resolve(); await Promise.resolve();
      expect(core.getState().saveStatus).to.equal('saved');
    });

    it('single-flight: the requeued save uses the LATEST document, not the intermediate one', async () => {
      const saver = controlledSaver();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema: baseSchema, document: baseDocument });

      core.setField('/data/name', 'first');
      // Three more rapid edits while the first save is in flight.
      core.setField('/data/name', 'second');
      core.setField('/data/name', 'third');
      core.setField('/data/name', 'fourth');

      saver.resolveNext();
      await Promise.resolve(); await Promise.resolve();
      saver.resolveNext();
      await Promise.resolve(); await Promise.resolve();

      // Exactly two saves: the original, plus one collapsed retry of the
      // intermediate edits — which carries the *latest* value.
      expect(saver.calls).to.have.lengthOf(2);
      expect(saver.calls[0].document.data.name).to.equal('first');
      expect(saver.calls[1].document.data.name).to.equal('fourth');
    });

    it('does not re-queue after an error — next edit triggers a fresh save', async () => {
      const saver = controlledSaver({ failures: 1 });
      const core = createCore({ saveDocument: saver });
      await core.load({ schema: baseSchema, document: baseDocument });

      core.setField('/data/name', 'A');
      core.setField('/data/name', 'B'); // queued
      saver.resolveNext();
      await Promise.resolve(); await Promise.resolve();
      // First save errored; queued save was discarded.
      expect(core.getState().saveStatus).to.equal('error');
      expect(saver.calls).to.have.lengthOf(1);

      // Next edit must attempt again from scratch.
      core.setField('/data/name', 'C');
      expect(core.getState().saveStatus).to.equal('saving');
      saver.resolveNext();
      await Promise.resolve(); await Promise.resolve();
      expect(core.getState().saveStatus).to.equal('saved');
      expect(saver.calls).to.have.lengthOf(2);
      expect(saver.calls[1].document.data.name).to.equal('C');
    });

    it('onChange fires for mutations and for save-status transitions', async () => {
      const saver = controlledSaver();
      let fires = 0;
      const core = createCore({ saveDocument: saver, onChange: () => { fires += 1; } });
      await core.load({ schema: baseSchema, document: baseDocument });

      const before = fires;
      core.setField('/data/name', 'X');
      // After the synchronous portion: one fire for commit, one for saving.
      expect(fires - before).to.equal(2);

      saver.resolveNext();
      await Promise.resolve(); await Promise.resolve();
      // One more fire for the saved status.
      expect(fires - before).to.equal(3);
    });

    it('a no-op mutation does not start a save', async () => {
      const saver = controlledSaver();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema: baseSchema, document: baseDocument });
      core.setField('/data/name', 'Alice'); // same as base
      await Promise.resolve();
      expect(saver.calls).to.have.lengthOf(0);
      expect(core.getState().saveStatus).to.equal('idle');
    });

    it('load clears any pending re-queue from a previous document', async () => {
      const saver = controlledSaver();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema: baseSchema, document: baseDocument });

      core.setField('/data/name', 'A');
      core.setField('/data/name', 'B'); // would queue a second save

      // Load a different document before the in-flight save completes.
      const loadPromise = core.load({
        schema: baseSchema,
        document: { metadata: { schemaName: 'x' }, data: { name: 'fresh' } },
      });

      // Resolve the originally in-flight save — the queued 'B' must not
      // resave the now-stale document.
      saver.resolveNext();
      await loadPromise;
      await Promise.resolve(); await Promise.resolve();

      expect(saver.calls).to.have.lengthOf(1);
      expect(saver.calls[0].document.data.name).to.equal('A');
    });
  });
});
