import { expect } from '@esm-bundle/chai';
import {
  createEngine,
  convertJsonToHtml,
  convertHtmlToJson,
} from '../../../../nx/blocks/form/deps/da-sc-sdk/dist/index.js';
import { attachPersistence } from '../../../../nx/blocks/form/utils/persistence.js';

// Smoke tests against the REAL vendored SDK bundle
// (`nx/blocks/form/deps/da-sc-sdk/dist/index.js`).
//
// Goal: detect SDK breaking changes before they reach production. Every
// SDK surface the form block depends on is exercised here:
//
//   imports          createEngine, convertJsonToHtml, convertHtmlToJson
//   engine methods   getState, setField, addItem, insertItem, removeItem, moveItem
//   state shape      document, model.root, validation.errors[p].message, schemaIssues
//   semantics        onChange fires once per real mutation; not at construction;
//                    not on no-ops
//   error shapes     convertJsonToHtml / convertHtmlToJson return { error }
//                    on bad input (persistence.js depends on this branch)
//
// These tests intentionally avoid stubbing the SDK. The stub-based tests in
// utils/persistence.test.js cover persistence's behavioral edge cases under
// deterministic timing; this file covers the SDK ↔ form-block boundary.

const demoSchema = {
  type: 'object',
  title: 'Demo',
  required: ['name'],
  properties: {
    name: { type: 'string', title: 'Name' },
    tags: { type: 'array', title: 'Tags', items: { type: 'string', title: 'Tag' } },
  },
};

const validDoc = (data = {}) => ({ metadata: { schemaName: 'demo' }, data });

describe('SDK API surface', () => {
  it('every export the form block imports is a function', () => {
    expect(createEngine).to.be.a('function');
    expect(convertJsonToHtml).to.be.a('function');
    expect(convertHtmlToJson).to.be.a('function');
  });

  it('engine exposes every method the form block calls', () => {
    const engine = createEngine({ schema: demoSchema, document: validDoc() });
    expect(engine.getState).to.be.a('function');
    expect(engine.setField).to.be.a('function');
    expect(engine.addItem).to.be.a('function');
    expect(engine.insertItem).to.be.a('function');
    expect(engine.removeItem).to.be.a('function');
    expect(engine.moveItem).to.be.a('function');
  });
});

describe('SDK state shape', () => {
  it('getState() exposes the fields the form block reads', () => {
    const engine = createEngine({ schema: demoSchema, document: validDoc({ name: 'Alice' }) });
    const state = engine.getState();

    // persistence.js + preview.js
    expect(state.document).to.have.property('metadata');
    expect(state.document).to.have.property('data');
    expect(state.document.data.name).to.equal('Alice');

    // form.js + sidebar.js + editor.js
    expect(state.model).to.be.an('object');
    expect(state.model).to.have.property('root');

    // editor.js
    expect(state.validation).to.have.property('errors');
    expect(state.schemaIssues).to.be.an('array');
  });

  it('validation.errors entries carry a .message field (read by editor.js)', () => {
    // Force a required-field error; the schema requires `name` and we omit it.
    const engine = createEngine({ schema: demoSchema, document: validDoc() });
    const entry = engine.getState().validation.errors['/data/name'];

    expect(entry).to.be.an('object');
    expect(entry.message).to.be.a('string');
  });
});

describe('SDK engine mutations', () => {
  it('setField updates the document and produces a new reference', () => {
    const engine = createEngine({ schema: demoSchema, document: validDoc() });
    const before = engine.getState().document;
    engine.setField('/data/name', 'Bob');
    const after = engine.getState().document;
    expect(after).to.not.equal(before);
    expect(after.data.name).to.equal('Bob');
  });

  it('setField with current value is a no-op (state reference preserved)', () => {
    const engine = createEngine({ schema: demoSchema, document: validDoc({ name: 'Bob' }) });
    const before = engine.getState().document;
    engine.setField('/data/name', 'Bob');
    const after = engine.getState().document;
    expect(after).to.equal(before);
  });

  it('addItem appends a slot to the array at the pointer', () => {
    const engine = createEngine({ schema: demoSchema, document: validDoc({ name: 'A', tags: [] }) });
    engine.addItem('/data/tags');
    expect(engine.getState().document.data.tags).to.have.lengthOf(1);
  });

  it('insertItem inserts before the pointer', () => {
    const engine = createEngine({
      schema: demoSchema,
      document: validDoc({ name: 'A', tags: ['existing'] }),
    });
    engine.insertItem('/data/tags/0');
    const { tags } = engine.getState().document.data;
    expect(tags).to.have.lengthOf(2);
    expect(tags[1]).to.equal('existing'); // existing moved right
  });

  it('removeItem removes the item at the pointer', () => {
    const engine = createEngine({
      schema: demoSchema,
      document: validDoc({ name: 'A', tags: ['a', 'b'] }),
    });
    engine.removeItem('/data/tags/0');
    expect(engine.getState().document.data.tags).to.deep.equal(['b']);
  });

  it('moveItem reorders items in the array at the pointer', () => {
    const engine = createEngine({
      schema: demoSchema,
      document: validDoc({ name: 'A', tags: ['a', 'b', 'c'] }),
    });
    engine.moveItem('/data/tags', 0, 2);
    expect(engine.getState().document.data.tags).to.deep.equal(['b', 'c', 'a']);
  });
});

describe('SDK onChange semantics', () => {
  it('does not fire during createEngine construction', () => {
    let calls = 0;
    createEngine({
      schema: demoSchema,
      document: validDoc(),
      onChange: () => { calls += 1; },
    });
    expect(calls).to.equal(0);
  });

  it('fires exactly once per real mutation', () => {
    let calls = 0;
    const engine = createEngine({
      schema: demoSchema,
      document: validDoc(),
      onChange: () => { calls += 1; },
    });
    engine.setField('/data/name', 'Alice');
    expect(calls).to.equal(1);
    engine.setField('/data/name', 'Bob');
    expect(calls).to.equal(2);
  });

  it('does not fire on a no-op mutation (same value)', () => {
    let calls = 0;
    const engine = createEngine({
      schema: demoSchema,
      document: validDoc({ name: 'Alice' }),
      onChange: () => { calls += 1; },
    });
    engine.setField('/data/name', 'Alice');
    expect(calls).to.equal(0);
  });
});

describe('SDK converters', () => {
  it('convertJsonToHtml round-trips with convertHtmlToJson', () => {
    const original = validDoc({ name: 'Alice', tags: ['x', 'y'] });

    const forward = convertJsonToHtml({ json: original });
    expect(forward.error).to.equal(undefined);
    expect(forward.html).to.be.a('string');

    const back = convertHtmlToJson({ html: forward.html });
    expect(back.error).to.equal(undefined);
    expect(back.json).to.deep.equal(original);
  });

  it('convertJsonToHtml returns { error } on input without schemaName', () => {
    // persistence.js relies on this branch: `if (error) return;`
    const result = convertJsonToHtml({ json: { metadata: {}, data: {} } });
    expect(result.html).to.equal(undefined);
    expect(result.error).to.be.a('string');
  });

  it('convertHtmlToJson returns { error } on empty input', () => {
    const result = convertHtmlToJson({ html: '' });
    expect(result.json).to.equal(undefined);
    expect(result.error).to.be.a('string');
  });
});

describe('SDK × attachPersistence (end-to-end)', () => {
  it('saves after a real mutation through createEngine', async () => {
    let p;
    const calls = [];
    const save = async ({ path, html }) => { calls.push({ path, html }); };

    const editor = createEngine({
      schema: demoSchema,
      document: validDoc({ name: 'init' }),
      onChange: () => p?.notify(),
    });
    p = attachPersistence(editor, { path: '/smoke', save });

    editor.setField('/data/name', 'Alice');
    await new Promise((r) => { setTimeout(r, 0); });

    expect(calls).to.have.lengthOf(1);
    expect(calls[0].path).to.equal('/smoke');
    expect(calls[0].html).to.include('Alice');
    p.detach();
  });

  it('does not save when no real mutation occurs', async () => {
    let p;
    const calls = [];
    const save = async ({ path, html }) => { calls.push({ path, html }); };

    const editor = createEngine({
      schema: demoSchema,
      document: validDoc({ name: 'Alice' }),
      onChange: () => p?.notify(),
    });
    p = attachPersistence(editor, { path: '/smoke', save });

    editor.setField('/data/name', 'Alice'); // no-op
    await new Promise((r) => { setTimeout(r, 0); });

    expect(calls).to.have.lengthOf(0);
    p.detach();
  });
});
