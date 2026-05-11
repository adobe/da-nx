import { expect } from '@esm-bundle/chai';
import { buildModel, nodeAt } from '../../../nx/blocks/form/core/model.js';

const objectDef = (children, extra = {}) => ({
  key: 'data', kind: 'object', label: 'Data', children, ...extra,
});

const stringDef = (key, extra = {}) => ({
  key, kind: 'string', label: key, ...extra,
});

const arrayDef = (key, item, extra = {}) => ({
  key, kind: 'array', label: key, item, ...extra,
});

describe('buildModel', () => {
  it('returns null when there is no definition', () => {
    expect(buildModel({ definition: null, document: {} })).to.equal(null);
  });

  it('builds a node tree mirroring the definition', () => {
    const def = objectDef([
      stringDef('name'),
      arrayDef('tags', stringDef('item')),
    ]);
    const model = buildModel({ definition: def, document: { data: { name: 'Alice', tags: ['x', 'y'] } } });

    expect(model.root.kind).to.equal('object');
    expect(model.root.children).to.have.lengthOf(2);
    expect(model.root.children[0]).to.include({ key: 'name', value: 'Alice', pointer: '/data/name' });
    expect(model.root.children[1].items).to.have.lengthOf(2);
    expect(model.root.children[1].items[0].pointer).to.equal('/data/tags/0');
    expect(model.root.children[1].items[1].pointer).to.equal('/data/tags/1');
  });

  it('populates byPointer for every node', () => {
    const def = objectDef([
      stringDef('name'),
      arrayDef('items', objectDef([stringDef('label')])),
    ]);
    const model = buildModel({
      definition: def,
      document: { data: { name: 'x', items: [{ label: 'a' }] } },
    });

    expect(nodeAt({ model, pointer: '/data' })).to.exist;
    expect(nodeAt({ model, pointer: '/data/name' })).to.exist;
    expect(nodeAt({ model, pointer: '/data/items' })).to.exist;
    expect(nodeAt({ model, pointer: '/data/items/0' })).to.exist;
    expect(nodeAt({ model, pointer: '/data/items/0/label' })).to.exist;
    expect(nodeAt({ model, pointer: '/missing' })).to.equal(null);
  });

  it('escapes special characters in pointers', () => {
    const def = objectDef([stringDef('a/b'), stringDef('c~d')]);
    const model = buildModel({ definition: def, document: { data: { 'a/b': 'x', 'c~d': 'y' } } });
    expect(nodeAt({ model, pointer: '/data/a~1b' })?.value).to.equal('x');
    expect(nodeAt({ model, pointer: '/data/c~0d' })?.value).to.equal('y');
  });

  it('produces deterministic non-array ids across rebuilds', () => {
    const def = objectDef([stringDef('name')]);
    const a = buildModel({ definition: def, document: { data: { name: 'x' } } });
    const b = buildModel({ definition: def, document: { data: { name: 'y' } } });
    expect(b.root.children[0].id).to.equal(a.root.children[0].id);
  });

  it('preserves array-item ids on a reorder', () => {
    const def = objectDef([arrayDef('items', stringDef('item'))]);
    const first = buildModel({
      definition: def,
      document: { data: { items: ['a', 'b', 'c'] } },
    });
    const ids = first.root.children[0].items.map((n) => n.id);

    const reordered = buildModel({
      definition: def,
      document: { data: { items: ['c', 'a', 'b'] } },
      previousModel: first,
    });

    expect(reordered.root.children[0].items.map((n) => n.id))
      .to.deep.equal([ids[2], ids[0], ids[1]]);
  });

  it('assigns a fresh id to a newly-added array item', () => {
    const def = objectDef([arrayDef('items', stringDef('item'))]);
    const first = buildModel({
      definition: def,
      document: { data: { items: ['a'] } },
    });
    const firstId = first.root.children[0].items[0].id;

    const grown = buildModel({
      definition: def,
      document: { data: { items: ['a', 'b'] } },
      previousModel: first,
    });
    const { items } = grown.root.children[0];
    expect(items[0].id).to.equal(firstId);
    expect(items[1].id).to.not.equal(firstId);
  });

  it('exposes itemLabel from the item definition on array nodes', () => {
    const def = objectDef([
      arrayDef('contacts', { ...objectDef([stringDef('name')]), label: 'Contact' }),
    ]);
    const model = buildModel({ definition: def, document: { data: { contacts: [{}] } } });
    expect(model.root.children[0].itemLabel).to.equal('Contact');
  });
});
