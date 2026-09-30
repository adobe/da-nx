import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../../../nx/blocks/graphql/shared/confirm/confirm.js';
import '../../../../nx/blocks/graphql/nx-gql-endpoint/nx-gql-endpoint.js';
import '../../../../nx/blocks/graphql/nx-gql-endpoints/nx-gql-endpoints.js';
import { serializeConfig } from '../../../../nx/blocks/graphql/utils/endpoint.js';
import { wrapCodeblock } from '../../../../nx/blocks/graphql/utils/store.js';
import installMemorySource from './fixtures/memory-source.js';

const org = 'org';
const product = '{"type":"object","title":"Product","properties":{"title":{"type":"string"}}}';
const configFile = (site, name) => `/${org}/${site}/.da/graphql/endpoints/${name}/config.html`;
const artifactFile = (site, name) => `/${org}/${site}/.da/graphql/endpoints/${name}/schema.html`;
const schemaFile = (site, id) => `/${org}/${site}/.da/forms/schemas/${id}.html`;

const waitFor = async (check, tries = 100) => {
  for (let i = 0; i < tries && !check(); i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  expect(check()).to.be.ok;
};

const mount = async (tag, props) => {
  const el = Object.assign(document.createElement(tag), props);
  const events = [];
  ['route-change', 'endpoints-change'].forEach((type) => {
    el.addEventListener(type, ({ detail }) => events.push([type, detail]));
  });
  document.body.append(el);
  await el.updateComplete;
  return { el, events };
};

const siteOf = (site, endpoints = []) => ({
  org, site, endpoints, found: true, canWrite: true,
});

describe('pages', () => {
  let memory;
  let ask;
  beforeEach(() => {
    ask = sinon.stub(customElements.get('nx-confirm').prototype, 'ask');
  });
  afterEach(() => {
    memory?.restore();
    ask.restore();
    document.body.replaceChildren();
  });

  it('creates a new endpoint and saves it', async () => {
    const site = 'pages-create';
    memory = installMemorySource({ [schemaFile(site, 'product')]: wrapCodeblock(product) });
    const { el, events } = await mount('nx-gql-endpoint', {
      site: siteOf(site, ['zeta']), name: 'main', isNew: true,
    });
    await waitFor(() => el._draft);
    expect(el._draft).to.deep.equal({ name: 'main', schemas: [], isNew: true });
    expect(el.dirty).to.equal(true);
    expect(el.blocker).to.include('must be selected');

    await el.save();
    expect(memory.calls.some(([op]) => op === 'write')).to.equal(false);

    el._draft = { ...el._draft, schemas: ['product'] };
    await el.updateComplete;
    await el.save();
    expect(memory.files.has(configFile(site, 'main'))).to.equal(true);
    expect(memory.files.get(artifactFile(site, 'main'))).to.include('type Product');
    expect(events).to.deep.equal([
      ['endpoints-change', { endpoints: ['main', 'zeta'] }],
      ['route-change', { route: { org, site, endpoint: 'main' }, replace: true }],
    ]);
    expect(el._draft).to.deep.equal({ name: 'main', schemas: ['product'], isNew: false });
    expect(el.dirty).to.equal(false);
  });

  it('asks before leaving unsaved changes and discards them', async () => {
    const site = 'pages-leave';
    memory = installMemorySource({
      [schemaFile(site, 'product')]: wrapCodeblock(product),
      [configFile(site, 'main')]: wrapCodeblock(serializeConfig({ name: 'main', schemas: [] })),
    });
    const { el } = await mount('nx-gql-endpoint', { site: siteOf(site, ['main']), name: 'main' });
    await waitFor(() => el._draft);
    expect(await el.confirmLeave()).to.equal(true);
    expect(ask.called).to.equal(false);

    el._draft = { ...el._draft, schemas: ['product'] };
    ask.resolves(false);
    expect(await el.confirmLeave()).to.equal(false);
    expect(ask.firstCall.args[0].title).to.equal('Discard unsaved changes?');

    el.discard();
    expect(el._draft.schemas).to.deep.equal([]);
    expect(el.dirty).to.equal(false);
  });

  it('returns to the list when a new endpoint is cancelled', async () => {
    const site = 'pages-cancel';
    memory = installMemorySource();
    const { el, events } = await mount('nx-gql-endpoint', {
      site: siteOf(site), name: 'main', isNew: true,
    });
    await waitFor(() => el._draft);
    el.discard();
    expect(events).to.deep.equal([['route-change', { route: { org, site }, replace: true }]]);
  });

  it('returns to the list when the endpoint cannot be opened', async () => {
    const site = 'pages-missing';
    memory = installMemorySource();
    const { el, events } = await mount('nx-gql-endpoint', { site: siteOf(site), name: 'gone' });
    await waitFor(() => events.length);
    expect(events).to.deep.equal([['route-change', { route: { org, site }, replace: true }]]);
    expect(el._draft).to.equal(undefined);
  });

  it('deletes an endpoint after confirmation', async () => {
    const site = 'pages-delete';
    memory = installMemorySource({
      [configFile(site, 'main')]: '',
      [artifactFile(site, 'main')]: '',
    });
    const { el, events } = await mount('nx-gql-endpoints', { site: siteOf(site, ['ios', 'main']) });

    ask.resolves(false);
    await el.handleDelete('main');
    expect(memory.files.size).to.equal(2);
    expect(events).to.deep.equal([]);

    ask.resolves(true);
    await el.handleDelete('main');
    expect(ask.lastCall.args[0].title).to.equal('Delete endpoint?');
    expect(memory.files.size).to.equal(0);
    expect(events).to.deep.equal([['endpoints-change', { endpoints: ['ios'] }]]);
  });
});
