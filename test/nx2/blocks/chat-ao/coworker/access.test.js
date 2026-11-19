import { expect } from '@esm-bundle/chai';
import { checkCoworkerAccess } from '../../../../../nx2/blocks/chat-ao/coworker/access.js';
import {
  resolveCoworkerAccessBase, resolveAoHttpBase,
} from '../../../../../nx2/blocks/chat-ao/coworker/endpoints.js';
import { resetMockIms, setMockIms } from '../../../../../nx2/test/mocks/ims.js';

const orgId = 'selected@AdobeOrg';
const uri = `/orgs/${orgId}/apps/coworker/chat/*`;

function context({ org = orgId, region = 'CAN2', environment = 'PROD' } = {}) {
  return [{
    prodCtx: {
      owningEntity: org,
      serviceCode: 'dma_tartan',
      statusCode: 'ACTIVE',
      fulfillable_data: JSON.stringify({ region, environment }),
    },
  }];
}

function response(effect = 'permit', overrides = {}) {
  return { responses: [{ resource: { uri }, action: 'use', effect, ...overrides }] };
}

describe('Coworker access endpoints', () => {
  ['can2', 'new1'].forEach((region) => {
    it(`derives the ACS host from the AO region (${region}) without an allowlist`, () => {
      const profile = context({ region: region.toUpperCase() });
      expect(resolveAoHttpBase(profile))
        .to.equal(`https://agent-orchestrator-prod-${region}.adobe.io`);
      expect(resolveCoworkerAccessBase(profile))
        .to.equal(`https://cx-accesscontrol-${region}.adobe.io`);
    });
  });

  it('uses the same production VA7 fallback as AO when location is unavailable', () => {
    expect(resolveAoHttpBase()).to.equal('https://agent-orchestrator-prod-va7.adobe.io');
    expect(resolveCoworkerAccessBase()).to.equal('https://cx-accesscontrol-va7.adobe.io');
  });
});

describe('checkCoworkerAccess', () => {
  let originalFetch;
  let calls;
  let body;
  let status;

  beforeEach(() => {
    resetMockIms();
    setMockIms({ projectedProductContext: context() });
    originalFetch = window.fetch;
    calls = [];
    body = response();
    status = 200;
    window.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return new Response(JSON.stringify(body), { status });
    };
  });

  afterEach(() => {
    window.fetch = originalFetch;
    resetMockIms();
  });

  it('checks chat use with the selected IMS org and current user token', async () => {
    setMockIms({ token: { token: 'selected-org-token' } });
    expect(await checkCoworkerAccess()).to.deep.equal({ allowed: true });
    expect(calls).to.have.length(1);
    const [{ url, opts }] = calls;
    expect(url).to.equal('https://cx-accesscontrol-can2.adobe.io/enforcement/cx-coworker');
    expect(opts.method).to.equal('POST');
    expect(opts.headers).to.deep.equal({
      authorization: 'Bearer selected-org-token',
      'x-gw-ims-org-id': orgId,
      'content-type': 'application/json',
      accept: 'application/json',
    });
    expect(JSON.parse(opts.body)).to.deep.equal({
      requests: [{ resource: { uri }, action: 'use' }],
    });
  });

  it('reports an explicit denial separately from a failed check', async () => {
    body = response('deny');
    expect(await checkCoworkerAccess()).to.deep.equal({ allowed: false });
  });

  [401, 403, 500, 503].forEach((httpStatus) => {
    it(`reports HTTP ${httpStatus} as an error, not a decision`, async () => {
      status = httpStatus;
      expect(await checkCoworkerAccess()).to.deep.equal({ error: 'http', status });
    });
  });

  [
    { responses: [] },
    { responses: {} },
    { responses: [null] },
    { responses: [...response().responses, ...response().responses] },
    response('allow'),
    response('PERMIT'),
    response('permit', { action: 'manage' }),
    response('permit', { resource: { uri: '/orgs/other/apps/coworker/chat/*' } }),
  ].forEach((invalidBody, index) => {
    it(`rejects a malformed or mismatched decision (${index + 1})`, async () => {
      body = invalidBody;
      expect(await checkCoworkerAccess()).to.deep.equal({
        error: 'invalid-response', status: 200,
      });
    });
  });

  it('reports invalid JSON as an invalid response', async () => {
    window.fetch = async () => new Response('not json');
    expect(await checkCoworkerAccess()).to.deep.equal({
      error: 'invalid-response', status: 200,
    });
  });

  it('reports network failures without inferring CORS or denying access', async () => {
    window.fetch = async () => { throw new TypeError('Failed to fetch'); };
    expect(await checkCoworkerAccess()).to.deep.equal({ error: 'network' });
  });

  [
    { anonymous: true },
    { token: null },
    { projectedProductContext: [] },
  ].forEach((identity, index) => {
    it(`does not request access without a token and organization (${index + 1})`, async () => {
      setMockIms(identity);
      expect(await checkCoworkerAccess()).to.deep.equal({ error: 'identity' });
      expect(calls).to.have.length(0);
    });
  });

  [
    { environment: 'STAGE' },
    { environment: 'DEV' },
  ].forEach((location) => {
    it(`does not invent an ACS host for ${JSON.stringify(location)}`, async () => {
      setMockIms({ projectedProductContext: context(location) });
      expect(await checkCoworkerAccess()).to.deep.equal({ error: 'configuration' });
      expect(calls).to.have.length(0);
    });
  });

  it('shares concurrent checks but does not cache completed decisions', async () => {
    const results = await Promise.all([checkCoworkerAccess(), checkCoworkerAccess()]);
    expect(results).to.deep.equal([{ allowed: true }, { allowed: true }]);
    expect(calls).to.have.length(1);
    body = response('deny');
    expect(await checkCoworkerAccess()).to.deep.equal({ allowed: false });
    expect(calls).to.have.length(2);
  });

  it('does not cache failed requests', async () => {
    status = 503;
    expect(await checkCoworkerAccess()).to.deep.equal({ error: 'http', status: 503 });
    status = 200;
    expect(await checkCoworkerAccess()).to.deep.equal({ allowed: true });
    expect(calls).to.have.length(2);
  });

  it('does not share in-flight checks across organizations or tokens', async () => {
    const pending = [];
    window.fetch = (url, opts) => {
      calls.push({ url, opts });
      return new Promise((resolve) => { pending.push(resolve); });
    };
    const first = checkCoworkerAccess();
    await Promise.resolve();
    setMockIms({ projectedProductContext: context({ org: 'other@AdobeOrg' }) });
    const second = checkCoworkerAccess();
    await Promise.resolve();
    setMockIms({ token: { token: 'refreshed-token' } });
    const third = checkCoworkerAccess();
    await Promise.resolve();
    expect(calls).to.have.length(3);
    pending.forEach((resolve, index) => {
      const result = response('permit', {
        resource: { uri: JSON.parse(calls[index].opts.body).requests[0].resource.uri },
      });
      resolve(new Response(JSON.stringify(result)));
    });
    expect(await Promise.all([first, second, third]))
      .to.deep.equal([{ allowed: true }, { allowed: true }, { allowed: true }]);
  });
});
