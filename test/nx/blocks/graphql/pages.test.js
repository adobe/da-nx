import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../../../nx/blocks/graphql/shared/confirm/confirm.js';
import '../../../../nx/blocks/graphql/nx-gql-endpoints/nx-gql-endpoints.js';
import installMemorySource from './fixtures/memory-source.js';

const org = 'org';
const configFile = (site, name) => `/${org}/${site}/.da/graphql/endpoints/${name}/config.html`;
const artifactFile = (site, name) => `/${org}/${site}/.da/graphql/endpoints/${name}/schema.html`;

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
