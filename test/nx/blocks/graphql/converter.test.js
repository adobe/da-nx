import { expect } from '@esm-bundle/chai';
import { generateSdl } from '../../../../nx/blocks/graphql/utils/sdl.js';
import project from './fixtures/project.schema.js';
import edgeCases from './fixtures/edge-cases.schema.js';

const loadGolden = async (name) => {
  const resp = await fetch(new URL(`./fixtures/${name}`, import.meta.url).href);
  return resp.text();
};

const obj = (properties, extra = {}) => ({
  type: 'object', title: 'T', properties, ...extra,
});

const messages = (list) => list.map(({ message }) => message);

describe('generateSdl', () => {
  it('matches the golden SDL for the schema-spec example', async () => {
    const { sdl, warnings, errors } = generateSdl({ schemas: [{ id: 'project', schema: project }] });
    expect(errors).to.deep.equal([]);
    expect(warnings).to.deep.equal([]);
    expect(sdl).to.equal(await loadGolden('project.graphql'));
  });

  it('matches the golden SDL for edge cases', async () => {
    const { sdl, warnings } = generateSdl({ schemas: [{ id: 'menu', schema: edgeCases }] });
    expect(sdl).to.equal(await loadGolden('edge-cases.graphql'));
    expect(warnings.map(({ pointer }) => pointer)).to.deep.equal([
      '/items/properties/extra',
      '/items/properties/missing',
      '/items/properties/metadata',
      '/items/properties/unknown',
    ]);
  });

  it('is deterministic regardless of input order', () => {
    const a = { id: 'a', schema: obj({ x: { type: 'string', title: 'X' } }) };
    const b = { id: 'b', schema: obj({ y: { type: 'integer', title: 'Y' } }) };
    expect(generateSdl({ schemas: [a, b] }).sdl).to.equal(generateSdl({ schemas: [b, a] }).sdl);
  });

  it('emits list and by-path query fields tagged with the schema id', () => {
    const { sdl } = generateSdl({ schemas: [{ id: 'blog-post', schema: obj({ x: { type: 'string', title: 'X' } }) }] });
    expect(sdl).to.include('blogPostList(first: Int = 20, after: String): BlogPostConnection! @schema(id: "blog-post")');
    expect(sdl).to.include('blogPostByPath(path: String!): BlogPostItem @schema(id: "blog-post")');
  });

  it('maps string formats to scalars and only emits used scalars', () => {
    const { sdl } = generateSdl({
      schemas: [{
        id: 'event',
        schema: obj({
          day: { type: 'string', title: 'Day', format: 'date' },
          status: {
            type: 'string', title: 'S', enum: ['A'], format: 'date',
          },
        }),
      }],
    });
    expect(sdl).to.include('day: Date');
    expect(sdl).to.include('status: String');
    expect(sdl).to.include('scalar Date');
    expect(sdl).to.include('scalar DateTime');
    expect(sdl).not.to.include('scalar Time');
    expect(sdl).not.to.include('scalar JSON');
  });

  it('namespaces $defs by root type so schemas can reuse def names', () => {
    const withContact = (field) => ({
      $defs: { Contact: obj({ [field]: { type: 'string', title: field } }) },
      ...obj({ contact: { $ref: '#/$defs/Contact' } }),
    });
    const { sdl, errors } = generateSdl({
      schemas: [
        { id: 'a', schema: withContact('email') },
        { id: 'b', schema: withContact('phone') },
      ],
    });
    expect(errors).to.deep.equal([]);
    expect(sdl).to.include('type AContact {');
    expect(sdl).to.include('type BContact {');
  });

  it('suffixes nested names that collide with envelope types', () => {
    const { sdl, warnings } = generateSdl({
      schemas: [{ id: 'order', schema: obj({ item: obj({ sku: { type: 'string', title: 'SKU' } }) }) }],
    });
    expect(sdl).to.include('item: OrderItem2');
    expect(sdl).to.include('type OrderItem2 {');
    expect(messages(warnings)[0]).to.include('"OrderItem" is already used');
  });

  it('suffixes reserved root names', () => {
    const { sdl } = generateSdl({ schemas: [{ id: 'query', schema: obj({ q: { type: 'string', title: 'Q' } }) }] });
    expect(sdl).to.include('type QueryType {');
    expect(sdl).to.include('queryTypeList(');
  });

  it('reports an error when two schema ids produce the same type', () => {
    const schema = obj({ x: { type: 'string', title: 'X' } });
    const { sdl, errors } = generateSdl({
      schemas: [{ id: 'my-type', schema }, { id: 'my_type', schema }],
    });
    expect(errors).to.have.length(1);
    expect(errors[0].schemaId).to.equal('my_type');
    expect(sdl).to.include('type MyType {');
  });

  it('reports an error when no usable schema is given', () => {
    expect(generateSdl({ schemas: [] }).errors).to.have.length(1);
    const { errors, warnings } = generateSdl({ schemas: [{ id: 'x', schema: { type: 'string', title: 'X' } }] });
    expect(errors).to.have.length(1);
    expect(messages(warnings)[0]).to.include('must be an object or an array');
  });

  it('maps an object root without properties to JSON data', () => {
    const { sdl, warnings } = generateSdl({ schemas: [{ id: 'blank', schema: obj({}) }] });
    expect(sdl).to.include('data: JSON');
    expect(warnings).to.have.length(1);
  });

  it('maps a recursive $ref chain without an object to JSON', () => {
    const schema = {
      $defs: { Loop: { $ref: '#/$defs/Loop' } },
      ...obj({ loop: { $ref: '#/$defs/Loop' } }),
    };
    const { sdl, warnings } = generateSdl({ schemas: [{ id: 'loop', schema }] });
    expect(sdl).to.include('loop: JSON');
    expect(messages(warnings)[0]).to.include('Recursive $ref');
  });

  it('maps an array without items to [JSON]', () => {
    const { sdl } = generateSdl({ schemas: [{ id: 'list', schema: obj({ tags: { type: 'array', title: 'Tags' } }) }] });
    expect(sdl).to.include('tags: [JSON]');
  });

  it('escapes triple quotes in descriptions', () => {
    const { sdl } = generateSdl({ schemas: [{ id: 'q', schema: obj({ x: { type: 'string', title: 'Say """hi"""' } }) }] });
    expect(sdl).to.include('Say \\"""hi\\"""');
  });

  it('escapes quotes in directive arguments and validates the result', () => {
    const { sdl, errors } = generateSdl({ schemas: [{ id: 'q', schema: obj({ 'a "b"\\c': { type: 'string', title: 'A' } }) }] });
    expect(sdl).to.include('a__b__c: String @source(key: "a \\"b\\"\\\\c")');
    expect(errors).to.deep.equal([]);
  });
});
