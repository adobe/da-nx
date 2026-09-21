import { expect } from '@esm-bundle/chai';
import { getOrCreateConnectorGuid } from '../../../nx/blocks/loc/connectors/lionbridge/connectorGuid.js';

let calls;
let origFetch;

function rawConfig(rows) {
  return {
    ':names': ['config'],
    ':type': 'multi-sheet',
    config: {
      total: rows.length,
      limit: rows.length,
      offset: 0,
      data: rows,
    },
  };
}

function installFetch(handler) {
  calls = [];
  origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    const u = url.toString();
    calls.push({ url: u, method: opts.method, body: opts.body });
    return handler(u, opts);
  };
}

function restoreFetch() {
  if (origFetch) window.fetch = origFetch;
  origFetch = null;
}

async function bodyToText(body) {
  // FormData in the test browser exposes entries(); the config file is
  // appended under the 'data' key as a Blob.
  const blob = body.get('data');
  return blob.text();
}

describe('lionbridge connectorGuid', () => {
  afterEach(() => restoreFetch());

  it('returns the cached guid on the service object without any network call', async () => {
    installFetch(() => { throw new Error('should not fetch'); });

    const service = { org: 'acme', site: 'site1', env: 'prod', connectorGuid: 'cached-guid' };
    const guid = await getOrCreateConnectorGuid(service);

    expect(guid).to.equal('cached-guid');
    expect(calls).to.have.length(0);
  });

  it('reads an existing guid from config without writing it back', async () => {
    installFetch((url) => {
      if (url.includes('/ping/')) return new Response('', { status: 200 });
      if (url.endsWith('.da/translate.json') || url.includes('.da%2Ftranslate.json')) {
        return new Response(JSON.stringify(rawConfig([
          { key: 'translation.service.prod.connectorGuid', value: 'existing-guid' },
        ])), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const service = { org: 'acme', site: 'site2', env: 'prod' };
    const guid = await getOrCreateConnectorGuid(service);

    expect(guid).to.equal('existing-guid');
    expect(calls.filter((c) => c.method === 'POST')).to.have.length(0);
    expect(service.connectorGuid).to.equal('existing-guid');
  });

  it('generates and persists a new guid when none exists', async () => {
    installFetch((url) => {
      if (url.includes('/ping/')) return new Response('', { status: 200 });
      if (url.endsWith('.da/translate.json')) {
        return new Response(JSON.stringify(rawConfig([
          { key: 'translation.service.name', value: 'Lionbridge' },
        ])), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const service = { org: 'acme', site: 'site3', env: 'prod' };
    const guid = await getOrCreateConnectorGuid(service);

    expect(guid).to.be.a('string');
    expect(guid.length).to.be.greaterThan(0);
    expect(service.connectorGuid).to.equal(guid);

    const saveCall = calls.find((c) => c.method === 'POST');
    expect(saveCall, 'save call').to.exist;

    const savedJson = JSON.parse(await bodyToText(saveCall.body));
    const savedRow = savedJson.config.data.find((row) => row.key === 'translation.service.prod.connectorGuid');
    expect(savedRow.value).to.equal(guid);
  });

  it('returns null when the config cannot be read', async () => {
    installFetch(() => new Response('', { status: 404 }));

    const service = { org: 'acme', site: 'site4', env: 'prod' };
    const guid = await getOrCreateConnectorGuid(service);

    expect(guid).to.equal(null);
  });

  it('returns null when the save fails', async () => {
    installFetch((url, opts) => {
      if (opts.method === 'POST') return new Response('', { status: 500 });
      return new Response(JSON.stringify(rawConfig([])), { status: 200 });
    });

    const service = { org: 'acme', site: 'site5', env: 'prod' };
    const guid = await getOrCreateConnectorGuid(service);

    expect(guid).to.equal(null);
    expect(service.connectorGuid).to.equal(undefined);
  });

  it('defaults env to prod when building the config key', async () => {
    installFetch(() => new Response(JSON.stringify(rawConfig([
      { key: 'translation.service.prod.connectorGuid', value: 'prod-guid' },
    ])), { status: 200 }));

    const service = { org: 'acme', site: 'site6' };
    const guid = await getOrCreateConnectorGuid(service);

    expect(guid).to.equal('prod-guid');
  });
});
