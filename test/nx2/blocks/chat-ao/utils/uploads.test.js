import { expect } from '@esm-bundle/chai';
import {
  getOrgId, resolveAoHttpBase, resolveAoWsBase, uploadAttachment,
} from '../../../../../nx2/blocks/chat-ao/utils/uploads.js';
import { AO_HTTP_BASE, AO_WS_BASE } from '../../../../../nx2/blocks/chat-ao/ao-constants.js';
import { setMockIms, resetMockIms } from '../../../../../nx2/test/mocks/ims.js';

function withActiveTartan(fulfillableData) {
  return [
    { prodCtx: { serviceCode: 'dma_app_builder', statusCode: 'ACTIVE' } },
    {
      prodCtx: {
        serviceCode: 'dma_tartan',
        statusCode: 'ACTIVE',
        fulfillable_data: JSON.stringify(fulfillableData),
      },
    },
  ];
}

describe('uploads.js getOrgId', () => {
  it('returns the owningEntity from the entry that has one', () => {
    const ctx = [{ prodCtx: { serviceCode: 'x' } }, { prodCtx: { owningEntity: 'org1' } }];
    expect(getOrgId(ctx)).to.equal('org1');
  });

  it('returns undefined when there is no projectedProductContext', () => {
    expect(getOrgId(undefined)).to.equal(undefined);
  });
});

describe('uploads.js resolveAoHttpBase/resolveAoWsBase', () => {
  it('falls back to the default base when there is no projectedProductContext', () => {
    expect(resolveAoHttpBase(undefined)).to.equal(AO_HTTP_BASE);
    expect(resolveAoWsBase(undefined)).to.equal(AO_WS_BASE);
  });

  it('falls back to the default base when no entry is ACTIVE acp/dma_tartan', () => {
    const ctx = [{ prodCtx: { serviceCode: 'dma_app_builder', statusCode: 'ACTIVE' } }];
    expect(resolveAoHttpBase(ctx)).to.equal(AO_HTTP_BASE);
  });

  it('falls back to the default base when the matching entry is not ACTIVE', () => {
    const ctx = [{
      prodCtx: {
        serviceCode: 'dma_tartan',
        statusCode: 'INACTIVE',
        fulfillable_data: JSON.stringify({ region: 'EU1', environment: 'PROD' }),
      },
    }];
    expect(resolveAoHttpBase(ctx)).to.equal(AO_HTTP_BASE);
  });

  it('falls back to the default base when fulfillable_data is missing region/environment', () => {
    const ctx = withActiveTartan({ tenant_id: 'sitesinternal' });
    expect(resolveAoHttpBase(ctx)).to.equal(AO_HTTP_BASE);
  });

  it('falls back to the default base when fulfillable_data is malformed JSON', () => {
    const ctx = [{
      prodCtx: { serviceCode: 'dma_tartan', statusCode: 'ACTIVE', fulfillable_data: 'not json' },
    }];
    expect(resolveAoHttpBase(ctx)).to.equal(AO_HTTP_BASE);
  });

  it('builds the region-specific https/wss base from an ACTIVE dma_tartan entry, lowercased', () => {
    const ctx = withActiveTartan({ region: 'VA7', environment: 'PROD' });
    expect(resolveAoHttpBase(ctx)).to.equal('https://agent-orchestrator-prod-va7.adobe.io');
    expect(resolveAoWsBase(ctx)).to.equal('wss://agent-orchestrator-prod-va7.adobe.io');
  });

  it('resolves a non-default region/environment (e.g. EU stage)', () => {
    const ctx = withActiveTartan({ region: 'EU1', environment: 'STAGE' });
    expect(resolveAoHttpBase(ctx)).to.equal('https://agent-orchestrator-stage-eu1.adobe.io');
    expect(resolveAoWsBase(ctx)).to.equal('wss://agent-orchestrator-stage-eu1.adobe.io');
  });

  it('matches on an ACTIVE acp entry too, not just dma_tartan', () => {
    const ctx = [{
      prodCtx: {
        serviceCode: 'acp',
        statusCode: 'ACTIVE',
        fulfillable_data: JSON.stringify({ region: 'VA7', environment: 'PROD' }),
      },
    }];
    expect(resolveAoHttpBase(ctx)).to.equal('https://agent-orchestrator-prod-va7.adobe.io');
  });
});

describe('uploadAttachment', () => {
  const attachment = { fileName: 'design.png', mediaType: 'image/png', dataBase64: btoa('image-bytes') };

  // Real fetch is the only thing stubbed — initiate/PUT/finalize sequencing,
  // header building, and every early-return branch run for real.
  function installFetch(routes) {
    const calls = [];
    const origFetch = window.fetch;
    window.fetch = async (url, opts = {}) => {
      calls.push({ url: url.toString(), opts });
      const route = routes.find((r) => r.match(url.toString(), opts));
      if (!route) throw new Error(`unexpected fetch: ${url}`);
      if (route.throws) throw route.throws;
      return new Response(JSON.stringify(route.body ?? {}), { status: route.status ?? 200 });
    };
    return { calls, restore: () => { window.fetch = origFetch; } };
  }

  const initiateRoute = (opts) => ({
    match: (url, o) => url === `${AO_HTTP_BASE}/api/v1/files/upload` && o.method === 'POST',
    ...opts,
  });
  const putRoute = (opts) => ({
    match: (url, o) => url === 'https://blob.example/upload-1' && o.method === 'PUT',
    ...opts,
  });
  const finalizeRoute = (opts) => ({
    match: (url, o) => url === `${AO_HTTP_BASE}/api/v1/files/file-1/finalize` && o.method === 'POST',
    ...opts,
  });

  beforeEach(() => {
    setMockIms({ projectedProductContext: [{ prodCtx: { owningEntity: 'org1' } }] });
  });

  afterEach(() => resetMockIms());

  it('runs initiate -> PUT -> finalize and returns the artifact id', async () => {
    const { calls, restore } = installFetch([
      initiateRoute({ body: { file_id: 'file-1', upload_url: 'https://blob.example/upload-1' } }),
      putRoute(),
      finalizeRoute({ body: { artifact_id: 'artifact-1' } }),
    ]);

    let result;
    try {
      result = await uploadAttachment(attachment);
    } finally {
      restore();
    }

    expect(result).to.equal('artifact-1');
    expect(calls).to.have.length(3);
    expect(calls[0].opts.headers.authorization).to.equal('Bearer test-token');
    expect(calls[0].opts.headers['x-tenant-id']).to.equal('org1');
    expect(JSON.parse(calls[0].opts.body)).to.deep.equal({
      filename: 'design.png', content_type: 'image/png', scope: 'user',
    });
    expect(calls[1].opts.headers['content-type']).to.equal('image/png');
    expect(calls[1].opts.headers['x-ms-blob-type']).to.equal('BlockBlob');
  });

  it('returns null without attempting PUT or finalize when initiate is not ok', async () => {
    const { calls, restore } = installFetch([initiateRoute({ status: 500 })]);

    let result;
    try {
      result = await uploadAttachment(attachment);
    } finally {
      restore();
    }

    expect(result).to.equal(null);
    expect(calls).to.have.length(1);
  });

  it('returns null when initiate responds ok but omits file_id or upload_url', async () => {
    const { restore } = installFetch([
      initiateRoute({ body: { upload_url: 'https://blob.example/upload-1' } }),
    ]);
    try {
      expect(await uploadAttachment(attachment)).to.equal(null);
    } finally {
      restore();
    }
  });

  it('returns null without attempting finalize when the PUT upload is not ok', async () => {
    const { calls, restore } = installFetch([
      initiateRoute({ body: { file_id: 'file-1', upload_url: 'https://blob.example/upload-1' } }),
      putRoute({ status: 500 }),
      finalizeRoute(),
    ]);

    let result;
    try {
      result = await uploadAttachment(attachment);
    } finally {
      restore();
    }

    expect(result).to.equal(null);
    expect(calls).to.have.length(2);
  });

  it('returns null when finalize is not ok', async () => {
    const { restore } = installFetch([
      initiateRoute({ body: { file_id: 'file-1', upload_url: 'https://blob.example/upload-1' } }),
      putRoute(),
      finalizeRoute({ status: 500 }),
    ]);

    let result;
    try {
      result = await uploadAttachment(attachment);
    } finally {
      restore();
    }

    expect(result).to.equal(null);
  });

  it('returns null rather than throwing when fetch itself throws', async () => {
    const origFetch = window.fetch;
    window.fetch = async () => { throw new Error('network down'); };

    let result;
    try {
      result = await uploadAttachment(attachment);
    } finally {
      window.fetch = origFetch;
    }

    expect(result).to.equal(null);
  });
});
