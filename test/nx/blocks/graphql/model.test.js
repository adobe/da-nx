import { expect } from '@esm-bundle/chai';
import { buildHash, isSameRoute, toRoute } from '../../../../nx/blocks/graphql/utils/route.js';
import { annotateSchemas, describeIssues } from '../../../../nx/blocks/graphql/utils/store.js';
import { buildPreview } from '../../../../nx/blocks/graphql/utils/sdl.js';
import { describeProblem } from '../../../../nx/blocks/graphql/utils/messages.js';
import {
  createDraft, getSaveBlocker, getSchemaEditorHref, toSavePayload,
} from '../../../../nx/blocks/graphql/utils/endpoint.js';

const product = {
  type: 'object',
  properties: { title: { type: 'string' } },
};

const loaded = (id, schema = product) => ({
  id, status: 'loaded', schema, valid: true, issues: [],
});

describe('route', () => {
  it('parses hash details', () => {
    expect(toRoute(null)).to.equal(undefined);
    expect(toRoute({ org: 'o', site: null, path: null })).to.deep.equal({ org: 'o' });
    expect(toRoute({ org: 'o', site: 's', path: null })).to.deep.equal({ org: 'o', site: 's' });
    expect(toRoute({ org: 'o', site: 's', path: 'endpoints' })).to.deep.equal({ org: 'o', site: 's' });
    expect(toRoute({ org: 'o', site: 's', path: 'endpoints/main' }))
      .to.deep.equal({ org: 'o', site: 's', endpoint: 'main' });
  });

  it('falls back to the endpoint list for unknown sections', () => {
    expect(toRoute({ org: 'o', site: 's', path: 'main' })).to.deep.equal({ org: 'o', site: 's' });
    expect(toRoute({ org: 'o', site: 's', path: 'other/main' })).to.deep.equal({ org: 'o', site: 's' });
  });

  it('opens the endpoint list for unusable endpoint segments', () => {
    expect(toRoute({ org: 'o', site: 's', path: 'endpoints/a/b' })).to.deep.equal({ org: 'o', site: 's' });
    expect(toRoute({ org: 'o', site: 's', path: 'endpoints/Main' })).to.deep.equal({ org: 'o', site: 's' });
  });

  it('builds hashes and compares routes', () => {
    expect(buildHash({ org: 'o', site: 's', endpoint: 'main' })).to.equal('#/o/s/endpoints/main');
    expect(buildHash({ org: 'o', site: 's' })).to.equal('#/o/s/endpoints');
    expect(buildHash({ org: 'o', endpoint: 'main' })).to.equal('#/o');
    expect(buildHash({})).to.equal('');
    expect(getSchemaEditorHref({ origin: 'https://da.live', org: 'o', site: 's' }))
      .to.equal('https://da.live/apps/schema#/o/s');
    expect(isSameRoute({ route: { org: 'o', site: 's' }, other: { org: 'o', site: 's' } })).to.equal(true);
    expect(isSameRoute({
      route: { org: 'o', site: 's' }, other: { org: 'o', site: 's', endpoint: 'e' },
    })).to.equal(false);
  });
});

describe('validation', () => {
  it('annotates schemas by load status and validator result', () => {
    const validate = (schema) => (schema.bad
      ? { valid: false, schemaIssues: [{ message: 'Nope.', schemaPath: '/properties/x' }] }
      : { valid: true });
    const result = annotateSchemas({
      schemas: [
        { id: 'a', status: 'loaded', schema: product },
        { id: 'b', status: 'loaded', schema: { bad: true } },
        { id: 'c', status: 'invalid-json' },
      ],
      validate,
    });
    expect(result.map(({ valid }) => valid)).to.deep.equal([true, false, false]);
    expect(result[1].issues).to.deep.equal(['Nope (at #/properties/x)']);
    expect(result[2].issues[0]).to.include('valid JSON');
    expect(result.map((entry) => entry.valid)).to.deep.equal([true, false, false]);
  });

  it('describes root issues and dedupes', () => {
    const issue = { reason: 'Bad', schemaPath: '/' };
    expect(describeIssues([issue, issue])).to.deep.equal(['Bad (at the schema root)']);
  });
});

describe('model', () => {
  it('starts new endpoints with no schemas', () => {
    expect(createDraft({ name: 'main' })).to.deep.equal({ name: 'main', schemas: [], isNew: true });
  });

  it('builds a preview from usable selected schemas only', () => {
    const draft = { ...createDraft(), schemas: ['broken', 'gone', 'product'] };
    const schemas = [loaded('product'), { id: 'broken', status: 'loaded', schema: {}, valid: false }];
    const preview = buildPreview({ draft, schemas });
    expect(preview.errors).to.deep.equal([]);
    expect(preview.sdl).to.include('type Product {');
    expect(preview.warnings.slice(0, 2).map(describeProblem)).to.deep.equal([
      'broken: The schema is invalid and was skipped.',
      'gone: The schema no longer exists and was skipped.',
    ]);
  });

  it('builds a preview from the selected usable schemas', () => {
    const schemas = [
      loaded('product'),
      loaded('article'),
      { id: 'broken', status: 'loaded', schema: {}, valid: false },
    ];
    const draft = createDraft({ config: { name: 'main', schemas: ['product', 'article', 'broken'] } });
    const preview = buildPreview({ draft, schemas });
    expect(preview.sdl).to.include('type Product {');
    expect(preview.sdl).to.include('type Article {');
    expect(describeProblem(preview.warnings[0]))
      .to.equal('broken: The schema is invalid and was skipped.');
  });

  it('returns an empty preview without selected schemas', () => {
    const draft = { ...createDraft() };
    const preview = buildPreview({ draft, schemas: [loaded('product')] });
    expect(preview).to.deep.equal({
      sdl: '', warnings: [], errors: [],
    });
  });

  it('describes converter problems', () => {
    expect(describeProblem({ schemaId: '', pointer: '', message: 'Global.' })).to.equal('Global.');
    expect(describeProblem({ schemaId: 'a', pointer: '/properties/x', message: 'Bad.' }))
      .to.equal('a #/properties/x: Bad.');
  });

  it('explains why a draft cannot be saved', () => {
    const preview = { sdl: 'x', errors: [] };
    const draft = { ...createDraft(), name: 'main', schemas: ['a'] };
    expect(getSaveBlocker({ draft: { ...draft, name: 'Bad' }, preview })).to.include('lowercase');
    expect(getSaveBlocker({ draft, preview, existing: ['main'] })).to.include('already exists');
    expect(getSaveBlocker({ draft: { ...draft, schemas: [] }, preview })).to.include('must be selected');
    expect(getSaveBlocker({ draft, preview: { sdl: '', errors: ['e'] } })).to.include('errors');
    expect(getSaveBlocker({ draft, preview })).to.equal(undefined);
  });

  it('produces a save payload whose artifact is current', () => {
    const schemas = [loaded('product')];
    const draft = { ...createDraft(), name: 'main', schemas: ['product'] };
    const preview = buildPreview({ draft, schemas });
    const now = new Date('2024-01-02T03:04:05Z');
    const { config, artifact } = toSavePayload({ draft, preview, now });
    expect(config).to.deep.equal({ name: 'main', schemas: ['product'] });
    expect(artifact).to.include('# generatedAt: 2024-01-02T03:04:05.000Z');
    expect(artifact.endsWith(`\n\n${preview.sdl}`)).to.equal(true);
  });
});
