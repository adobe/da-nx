import { expect } from '@esm-bundle/chai';
import { createCore } from '../../nx/blocks/form/core/index.js';
import { serialize } from '../../nx/blocks/form/app/serialize.js';
import { convertHtmlToJson } from '../../nx/blocks/form/app/context.js';

// End-to-end data-integrity tests.
//
// Every test in this file exercises the full chain that runs in production:
//
//   in-memory document → setField → serialize() → json2html → HTML on disk
//                                                                ↓
//                                          html2json → parseDocument → next core.load
//
// The contract these tests lock in: any value the user can type, save, and
// reload must come back identical. If a regression hits any link in the chain
// (prune, json2html, html2json, isDataEmpty, materializeDefaults), one of
// these tests fails.

// Mirrors the production saveDocument in form.js: serialize + capture HTML.
// We don't hit the network — we capture what would have been POSTed.
function makeRoundtripHarness() {
  let savedHtml = null;
  const saveDocument = async ({ document }) => {
    const result = serialize({ json: document });
    if (result.error) return result;
    savedHtml = result.html;
    return { ok: true };
  };
  saveDocument.getSavedHtml = () => savedHtml;
  // Replay the save by converting the captured HTML back to JSON, then
  // loading it into a fresh core — simulating a page reload.
  saveDocument.reload = async (schema) => {
    if (savedHtml === null) throw new Error('Nothing has been saved yet.');
    const reloadedJson = convertHtmlToJson(savedHtml);
    const next = createCore({ saveDocument });
    await next.load({ schema, document: reloadedJson });
    return next;
  };
  return saveDocument;
}

async function flush() {
  // Two microtask yields covers a successful save (await saveDocument + the
  // do-while exit + patchState).
  await Promise.resolve();
  await Promise.resolve();
}

describe('roundtrip — save and reload preserves user data', () => {
  describe('primitives', () => {
    it('a typed string survives save → reload', async () => {
      const schema = {
        type: 'object',
        properties: { title: { type: 'string' } },
      };
      const saver = makeRoundtripHarness();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema, document: { metadata: { schemaName: 'x' }, data: {} } });

      core.setField('/data/title', 'Hello world');
      await flush();

      const next = await saver.reload(schema);
      const node = next.getState().model.byPointer.get('/data/title');
      expect(node.value).to.equal('Hello world');
    });

    it('a typed number survives save → reload', async () => {
      const schema = {
        type: 'object',
        properties: { count: { type: 'number' } },
      };
      const saver = makeRoundtripHarness();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema, document: { metadata: { schemaName: 'x' }, data: {} } });

      core.setField('/data/count', 42);
      await flush();

      const next = await saver.reload(schema);
      const node = next.getState().model.byPointer.get('/data/count');
      expect(node.value).to.equal(42);
    });

    it('an integer field accepts integer values', async () => {
      const schema = {
        type: 'object',
        properties: { count: { type: 'integer' } },
      };
      const saver = makeRoundtripHarness();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema, document: { metadata: { schemaName: 'x' }, data: {} } });

      core.setField('/data/count', 7);
      await flush();

      const next = await saver.reload(schema);
      const node = next.getState().model.byPointer.get('/data/count');
      expect(node.value).to.equal(7);
    });

    it('a true boolean survives save → reload', async () => {
      const schema = {
        type: 'object',
        properties: { flag: { type: 'boolean' } },
      };
      const saver = makeRoundtripHarness();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema, document: { metadata: { schemaName: 'x' }, data: {} } });
      // Materialization wrote `false`. User checks the box → true.
      core.setField('/data/flag', true);
      await flush();

      const next = await saver.reload(schema);
      const node = next.getState().model.byPointer.get('/data/flag');
      expect(node.value).to.equal(true);
    });

    it('a false boolean survives save → reload (the regression case)', async () => {
      // Critical: `false` must round-trip without being treated as "absent"
      // and reset to the schema default of `true`.
      const schema = {
        type: 'object',
        properties: { flag: { type: 'boolean', default: true } },
      };
      const saver = makeRoundtripHarness();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema, document: { metadata: { schemaName: 'x' }, data: {} } });

      core.setField('/data/flag', false);
      await flush();

      const next = await saver.reload(schema);
      const node = next.getState().model.byPointer.get('/data/flag');
      expect(node.value).to.equal(false);
    });

    it('a selected enum value survives save → reload', async () => {
      const schema = {
        type: 'object',
        properties: { status: { type: 'string', enum: ['draft', 'published', 'archived'] } },
      };
      const saver = makeRoundtripHarness();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema, document: { metadata: { schemaName: 'x' }, data: {} } });

      core.setField('/data/status', 'published');
      await flush();

      const next = await saver.reload(schema);
      const node = next.getState().model.byPointer.get('/data/status');
      expect(node.value).to.equal('published');
      expect(node.enumValues).to.deep.equal(['draft', 'published', 'archived']);
    });
  });

  describe('defaults', () => {
    it('schema defaults survive save → reload even when the user only edited a sibling', async () => {
      // The original bug: defaults shown on fresh load were not persisted
      // when the user typed in a different field.
      const schema = {
        type: 'object',
        properties: {
          a: { type: 'string', default: 'X' },
          b: { type: 'string', default: 'Y' },
          c: { type: 'string' },
        },
      };
      const saver = makeRoundtripHarness();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema, document: { metadata: { schemaName: 'x' }, data: {} } });

      core.setField('/data/c', 'Z');
      await flush();

      const next = await saver.reload(schema);
      const { byPointer } = next.getState().model;
      expect(byPointer.get('/data/a').value).to.equal('X');
      expect(byPointer.get('/data/b').value).to.equal('Y');
      expect(byPointer.get('/data/c').value).to.equal('Z');
    });

    it('a cleared field stays cleared across reloads', async () => {
      // Once the document is non-fresh on disk, materialization does not run
      // again and the cleared key stays absent.
      const schema = {
        type: 'object',
        properties: {
          a: { type: 'string', default: 'X' },
          b: { type: 'string' },
        },
      };
      const saver = makeRoundtripHarness();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema, document: { metadata: { schemaName: 'x' }, data: {} } });

      // Edit b so the doc has user content, then clear a.
      core.setField('/data/b', 'typed');
      core.setField('/data/a', '');
      await flush();
      await flush(); // single-flight requeue

      const next = await saver.reload(schema);
      const { byPointer } = next.getState().model;
      expect(byPointer.get('/data/a').value).to.equal(undefined);
      expect(byPointer.get('/data/b').value).to.equal('typed');
    });
  });

  describe('nested objects', () => {
    it('a value buried in a nested object survives save → reload', async () => {
      const schema = {
        type: 'object',
        properties: {
          outer: {
            type: 'object',
            properties: {
              inner: { type: 'string' },
            },
          },
        },
      };
      const saver = makeRoundtripHarness();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema, document: { metadata: { schemaName: 'x' }, data: {} } });

      core.setField('/data/outer/inner', 'deep');
      await flush();

      const next = await saver.reload(schema);
      const node = next.getState().model.byPointer.get('/data/outer/inner');
      expect(node.value).to.equal('deep');
    });
  });

  describe('arrays', () => {
    it('an added item with a typed value survives save → reload', async () => {
      const schema = {
        type: 'object',
        properties: {
          tags: { type: 'array', items: { type: 'string' } },
        },
      };
      const saver = makeRoundtripHarness();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema, document: { metadata: { schemaName: 'x' }, data: {} } });

      core.addItem('/data/tags');
      core.setField('/data/tags/0', 'first');
      core.addItem('/data/tags');
      core.setField('/data/tags/1', 'second');
      await flush();
      await flush();
      await flush();
      await flush();

      const next = await saver.reload(schema);
      const node = next.getState().model.byPointer.get('/data/tags');
      const values = node.items.map((item) => item.value);
      expect(values).to.deep.equal(['first', 'second']);
    });

    it('an array of objects with mixed primitive fields survives save → reload', async () => {
      const schema = {
        type: 'object',
        properties: {
          people: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                active: { type: 'boolean' },
              },
            },
          },
        },
      };
      const saver = makeRoundtripHarness();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema, document: { metadata: { schemaName: 'x' }, data: {} } });

      core.addItem('/data/people');
      core.setField('/data/people/0/name', 'Alice');
      core.setField('/data/people/0/active', true);
      core.addItem('/data/people');
      core.setField('/data/people/1/name', 'Bob');
      // Bob stays at the default `false` from materialization-on-add.
      // Save settle.
      for (let i = 0; i < 6; i += 1) await flush();

      const next = await saver.reload(schema);
      const { items } = next.getState().model.byPointer.get('/data/people');
      expect(items).to.have.lengthOf(2);

      const alice = next.getState().model.byPointer.get('/data/people/0');
      expect(alice.children.find((c) => c.key === 'name').value).to.equal('Alice');
      expect(alice.children.find((c) => c.key === 'active').value).to.equal(true);

      const bob = next.getState().model.byPointer.get('/data/people/1');
      expect(bob.children.find((c) => c.key === 'name').value).to.equal('Bob');
      expect(bob.children.find((c) => c.key === 'active').value).to.equal(false);
    });

    it('reordering survives save → reload', async () => {
      const schema = {
        type: 'object',
        properties: {
          tags: { type: 'array', items: { type: 'string' } },
        },
      };
      const saver = makeRoundtripHarness();
      const core = createCore({ saveDocument: saver });
      await core.load({ schema, document: { metadata: { schemaName: 'x' }, data: {} } });

      core.addItem('/data/tags');
      core.setField('/data/tags/0', 'A');
      core.addItem('/data/tags');
      core.setField('/data/tags/1', 'B');
      core.addItem('/data/tags');
      core.setField('/data/tags/2', 'C');
      core.moveItem('/data/tags', 0, 2);
      for (let i = 0; i < 8; i += 1) await flush();

      const next = await saver.reload(schema);
      const { items } = next.getState().model.byPointer.get('/data/tags');
      expect(items.map((i) => i.value)).to.deep.equal(['B', 'C', 'A']);
    });
  });

  describe('edit-on-reload', () => {
    it('a value edited, saved, reloaded, edited again, saved still round-trips', async () => {
      const schema = {
        type: 'object',
        properties: { title: { type: 'string' } },
      };
      const saver = makeRoundtripHarness();
      const core1 = createCore({ saveDocument: saver });
      await core1.load({ schema, document: { metadata: { schemaName: 'x' }, data: {} } });
      core1.setField('/data/title', 'v1');
      await flush();

      const core2 = await saver.reload(schema);
      expect(core2.getState().model.byPointer.get('/data/title').value).to.equal('v1');

      core2.setField('/data/title', 'v2');
      await flush();

      const core3 = await saver.reload(schema);
      expect(core3.getState().model.byPointer.get('/data/title').value).to.equal('v2');
    });
  });
});
