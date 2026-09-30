import { expect } from '@esm-bundle/chai';
import {
  deleteEndpoint, loadEndpoint, loadSchemas, loadSite, saveEndpoint, unwrapCodeblock, wrapCodeblock,
} from '../../../../nx/blocks/graphql/utils/store.js';
import installMemorySource from './fixtures/memory-source.js';

const org = 'org';
const site = 'site';
const BASE = `/${org}/${site}`;

const configFile = (name) => `${BASE}/.da/graphql/endpoints/${name}/config.html`;
const artifactFile = (name) => `${BASE}/.da/graphql/endpoints/${name}/schema.html`;
const schemaFile = (id, base = BASE) => `${base}/.da/forms/schemas/${id}.html`;

describe('store', () => {
  let memory;
  const install = (...args) => {
    memory = installMemorySource(...args);
    return memory;
  };
  afterEach(() => memory?.restore());

  it('loads a site with its valid endpoint folders sorted by name', async () => {
    install({
      [configFile('zeta')]: '',
      [configFile('alpha')]: '',
      [configFile('Bad Name')]: '',
      [`${BASE}/.da/graphql/endpoints/stray.html`]: '',
    });
    expect(await loadSite({ org, site }))
      .to.deep.equal({ endpoints: ['alpha', 'zeta'], found: true, canWrite: true });
    expect(memory.calls.some(([op]) => op === 'read')).to.equal(false);
  });

  it('reports whether the site exists and can be changed', async () => {
    install({ [`${BASE}/index.html`]: '' }, { permissions: ['read'] });
    expect(await loadSite({ org, site }))
      .to.deep.equal({ endpoints: [], found: true, canWrite: false });
    expect(await loadSite({ org, site: 'nope' }))
      .to.deep.equal({ endpoints: [], found: false, canWrite: false });
    memory.restore();

    install({ [schemaFile('a')]: '' }, { failLists: [BASE] });
    expect(await loadSite({ org, site }))
      .to.deep.equal({ error: 'Could not load org/site.', status: undefined });
  });

  it('lists no endpoints when the endpoints folder cannot be listed', async () => {
    install({ [`${BASE}/index.html`]: '' }, { failLists: [`${BASE}/.da/graphql/endpoints`] });
    expect((await loadSite({ org, site })).endpoints).to.deep.equal([]);
  });

  it('saves and loads an endpoint', async () => {
    install();
    const saved = await saveEndpoint({
      org, site, config: { name: 'm', schemas: ['b', 'a'] }, artifact: 'type Query { a: String }',
    });
    expect(saved).to.deep.equal({ ok: true });
    expect(JSON.parse(unwrapCodeblock(memory.files.get(configFile('m')))))
      .to.deep.equal({ name: 'm', schemas: ['a', 'b'] });
    expect(unwrapCodeblock(memory.files.get(artifactFile('m')))).to.equal('type Query { a: String }');
    expect(await loadEndpoint({ org, site, name: 'm' }))
      .to.deep.equal({ config: { name: 'm', schemas: ['a', 'b'] } });
  });

  it('reports missing and unreadable endpoints', async () => {
    install({ [configFile('b')]: wrapCodeblock('{}') }, { failReads: [configFile('b')] });
    const missing = await loadEndpoint({ org, site, name: 'nope' });
    expect([missing.status, missing.error]).to.deep.equal([404, 'Endpoint "nope" was not found.']);
    expect((await loadEndpoint({ org, site, name: 'b' })).status).to.equal(500);
  });

  it('surfaces a failed artifact write after the config was saved', async () => {
    install({}, { failWrites: [artifactFile('m')] });
    const result = await saveEndpoint({
      org, site, config: { name: 'm' }, artifact: '',
    });
    expect(result.error).to.include('GraphQL schema could not be saved');
    expect(memory.files.has(configFile('m'))).to.equal(true);
  });

  it('surfaces a failed config write without writing the artifact', async () => {
    install({}, { failWrites: [configFile('m')] });
    const result = await saveEndpoint({
      org, site, config: { name: 'm' }, artifact: '',
    });
    expect(result.error).to.include('configuration');
    expect(memory.calls.filter(([op]) => op === 'write')).to.have.length(1);
  });

  it('deletes both files and tolerates a missing artifact', async () => {
    install({ [configFile('m')]: '' });
    expect(await deleteEndpoint({ org, site, name: 'm' })).to.deep.equal({ ok: true });
    expect(memory.files.size).to.equal(0);
  });

  it('loads annotated site schemas once per site', async () => {
    const base = '/org/schemas-once';
    install({
      [schemaFile('b', base)]: wrapCodeblock('{"type":"object","properties":{"a":{"type":["string","null"]}}}'),
      [schemaFile('a', base)]: '<pre><code>{ nope</code></pre>',
      [schemaFile('c', base)]: '',
      [schemaFile('d', base)]: wrapCodeblock('{"type":"object","properties":{"a":{"type":"string"}}}'),
      [`${base}/.da/forms/schemas/readme.txt`]: '',
    }, { failReads: [schemaFile('c', base)] });
    const schemas = await loadSchemas({ org, site: 'schemas-once' });
    expect(await loadSchemas({ org, site: 'schemas-once' })).to.equal(schemas);
    expect(memory.calls.filter(([op]) => op === 'read')).to.have.length(4);
    expect(schemas.map(({ id, status, valid }) => [id, status, valid])).to.deep.equal([
      ['a', 'invalid-json', false],
      ['b', 'loaded', false],
      ['c', 'load-failed', false],
      ['d', 'loaded', true],
    ]);
    expect(schemas[1].issues)
      .to.deep.equal(['The type must be a single value, not an array (at #/properties/a)']);
  });
});
