import { expect } from '@esm-bundle/chai';
import { buildHash, isSameRoute, toRoute } from '../../../../nx/blocks/graphql/utils/route.js';
import { annotateSchemas, describeIssues } from '../../../../nx/blocks/graphql/utils/store.js';
import { buildPreview } from '../../../../nx/blocks/graphql/utils/sdl.js';
import { describeProblem } from '../../../../nx/blocks/graphql/utils/messages.js';
import {
  createDraft, getSaveBlocker, getSchemaEditorHref, NO_SCHEMAS_MESSAGE, toSavePayload,
} from '../../../../nx/blocks/graphql/utils/endpoint.js';
import {
  countChanges, filterSchemaOptions, getSchemaOptions, getSchemaStatus, sortSchemaOptions,
} from '../../../../nx/blocks/graphql/nx-gql-schema-picker/helpers/options.js';
import {
  getSaveState, isDirty, selectSchemas,
} from '../../../../nx/blocks/graphql/nx-gql-endpoint/helpers/draft.js';

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
  it('creates, toggles and compares drafts', () => {
    const config = { name: 'main', schemas: ['b'] };
    const draft = createDraft({ config });
    expect(draft).to.deep.equal({ name: 'main', schemas: ['b'], isNew: false });
    expect(isDirty({ draft, config })).to.equal(false);
    const toggled = selectSchemas({ draft, ids: ['a'], selected: true });
    expect(toggled.schemas).to.deep.equal(['a', 'b']);
    expect(isDirty({ draft: toggled, config })).to.equal(true);
    expect(selectSchemas({ draft: toggled, ids: ['b'], selected: false }).schemas)
      .to.deep.equal(['a']);
    expect(isDirty({ draft: undefined, config })).to.equal(false);
    expect(isDirty({ draft: createDraft({ name: 'new' }), config: undefined })).to.equal(true);
  });

  it('decides whether Save is enabled and why not', () => {
    const saved = { name: 'main', isNew: false };
    const fresh = { name: '', isNew: true };
    const enabled = { canSave: true, hint: undefined };
    expect(getSaveState({ draft: saved })).to.deep.equal(enabled);
    expect(getSaveState({ draft: saved, dirty: true })).to.deep.equal(enabled);
    expect(getSaveState({ draft: saved, dirty: true, busy: true }).canSave).to.equal(false);
    expect(getSaveState({ draft: saved, dirty: true, blocker: 'Fix it.' }))
      .to.deep.equal({ canSave: false, hint: 'Fix it.' });
    expect(getSaveState({ draft: saved, blocker: 'Fix it.' }))
      .to.deep.equal({ canSave: false, hint: undefined });
    expect(getSaveState({ draft: fresh, blocker: 'Select a schema.' }))
      .to.deep.equal({ canSave: false, hint: 'Select a schema.' });
    expect(getSaveState({ draft: fresh, blocker: NO_SCHEMAS_MESSAGE }))
      .to.deep.equal({ canSave: false, hint: undefined });
  });

  it('starts new endpoints with no schemas', () => {
    expect(createDraft({ name: 'main' })).to.deep.equal({ name: 'main', schemas: [], isNew: true });
  });

  it('selects and clears several schemas at once', () => {
    const draft = { ...createDraft(), schemas: ['b'] };
    const all = selectSchemas({ draft, ids: ['c', 'a', 'b'], selected: true });
    expect(all.schemas).to.deep.equal(['a', 'b', 'c']);
    expect(selectSchemas({ draft: all, ids: ['a', 'c'], selected: false }).schemas)
      .to.deep.equal(['b']);
    expect(draft.schemas).to.deep.equal(['b']);
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

  it('lists schema picker options including missing selections', () => {
    const draft = { ...createDraft(), schemas: ['gone', 'product'] };
    const schemas = [
      loaded('product', { ...product, title: 'Product' }),
      { id: 'broken', status: 'invalid-json', valid: false, issues: ['Bad JSON.'] },
    ];
    expect(getSchemaOptions({ draft, schemas })).to.deep.equal([
      {
        id: 'product', title: 'Product', selected: true, usable: true, issues: [],
      },
      {
        id: 'broken', title: undefined, selected: false, usable: false, issues: ['Bad JSON.'],
      },
      {
        id: 'gone', selected: true, usable: false, missing: true, issues: ['This schema no longer exists.'],
      },
    ]);
  });

  it('marks schemas the draft adds or removes against the saved endpoint', () => {
    const draft = { ...createDraft(), schemas: ['article', 'product'] };
    const schemas = [loaded('article', product), loaded('product', product), loaded('page', product)];
    const changes = (saved) => getSchemaOptions({ draft, schemas, saved })
      .map(({ id, change }) => [id, change]);
    expect(changes(['product', 'page', 'gone'])).to.deep.equal([
      ['article', 'adding'], ['product', undefined], ['page', 'removing'], ['gone', 'removing'],
    ]);
    expect(changes(undefined)).to.deep.equal([
      ['article', undefined], ['product', undefined], ['page', undefined],
    ]);
    expect(countChanges(getSchemaOptions({ draft, schemas, saved: ['product', 'page', 'gone'] })))
      .to.deep.equal({ adding: 1, removing: 2 });
  });

  it('filters schema options by id or title', () => {
    const options = [
      { id: 'product', title: 'Catalog Product' },
      { id: 'article', title: 'Blog Article' },
      { id: 'gone' },
    ];
    const ids = (query) => filterSchemaOptions({ options, query }).map(({ id }) => id);
    expect(ids('')).to.deep.equal(['product', 'article', 'gone']);
    expect(ids('  ')).to.deep.equal(['product', 'article', 'gone']);
    expect(ids(undefined)).to.deep.equal(['product', 'article', 'gone']);
    expect(ids('PROD')).to.deep.equal(['product']);
    expect(ids('blog')).to.deep.equal(['article']);
    expect(ids(' on ')).to.deep.equal(['gone']);
    expect(ids('zzz')).to.deep.equal([]);
  });

  it('filters schema options by their status label', () => {
    const options = [
      { id: 'product', title: 'Product' },
      { id: 'article', title: 'Article' },
      { id: 'gone' },
    ];
    const labels = { product: 'Invalid', gone: 'Not found' };
    const ids = (query) => filterSchemaOptions({
      options, query, statusLabel: ({ id }) => labels[id],
    }).map(({ id }) => id);
    expect(ids('inval')).to.deep.equal(['product']);
    expect(ids('NOT FOUND')).to.deep.equal(['gone']);
    expect(ids('art')).to.deep.equal(['article']);
  });

  it('sorts schema options by title, id and status', () => {
    const options = [
      { id: 'page', selected: true, usable: true },
      { id: 'Faq', title: 'faq', usable: true },
      { id: 'article', title: 'Blog Article', selected: true, usable: false },
      { id: 'product', title: 'Catalog Product', selected: true, usable: true },
      { id: 'event', title: 'Blog Article', usable: true },
    ];
    const ids = (key, direction) => sortSchemaOptions({ options, key, direction })
      .map(({ id }) => id);
    expect(ids()).to.deep.equal(['article', 'event', 'product', 'Faq', 'page']);
    expect(ids('id')).to.deep.equal(['article', 'event', 'Faq', 'page', 'product']);
    expect(ids('id', 'descending')).to.deep.equal(['product', 'page', 'Faq', 'event', 'article']);
    expect(ids('title')).to.deep.equal(['article', 'event', 'product', 'Faq', 'page']);
    expect(ids('title', 'descending'))
      .to.deep.equal(['page', 'Faq', 'product', 'article', 'event']);
    expect(ids('status')).to.deep.equal(['article', 'event', 'Faq', 'page', 'product']);
    expect(ids('status', 'descending'))
      .to.deep.equal(['article', 'event', 'Faq', 'page', 'product']);
    expect(options[0].id).to.equal('page');
  });

  it('derives the status of a schema row', () => {
    expect(getSchemaStatus({ selected: true, usable: true })).to.equal(undefined);
    expect(getSchemaStatus({ selected: false, usable: true })).to.equal(undefined);
    expect(getSchemaStatus({ selected: true, usable: false })).to.equal('invalid');
    expect(getSchemaStatus({ selected: false, usable: false })).to.equal('invalid');
    expect(getSchemaStatus({ selected: true, usable: false, missing: true })).to.equal('missing');
    expect(getSchemaStatus({ selected: true, usable: true, change: 'adding' })).to.equal('adding');
    expect(getSchemaStatus({ usable: false, missing: true, change: 'removing' }))
      .to.equal('removing');
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
