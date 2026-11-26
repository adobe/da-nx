import { expect } from '@esm-bundle/chai';
import { checkCoworkerAccess } from '../../../../../nx2/blocks/chat-ao/coworker/access.js';
import { resolveAoHttpBase } from '../../../../../nx2/blocks/chat-ao/coworker/endpoints.js';
import { resetMockIms, setMockIms } from '../../../mocks/ims.js';

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

function response(allowed = true) {
  return { allowed, reason: null, message: null };
}

describe('Coworker access endpoints', () => {
  ['can2', 'new1'].forEach((region) => {
    it(`resolves the AO region (${region}) without an allowlist`, () => {
      const profile = context({ region: region.toUpperCase() });
      expect(resolveAoHttpBase(profile))
        .to.equal(`https://agent-orchestrator-prod-${region}.adobe.io`);
    });
  });

  it('uses the same production VA7 fallback as AO when location is unavailable', () => {
    expect(resolveAoHttpBase()).to.equal('https://agent-orchestrator-prod-va7.adobe.io');
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
    setMockIms({ token: { token: 'selected-org-token' }, imsClientId: 'darkalley' });
    expect(await checkCoworkerAccess()).to.deep.equal({ allowed: true });
    expect(calls).to.have.length(1);
    const [{ url, opts }] = calls;
    expect(url).to.equal('https://agent-orchestrator-prod-can2.adobe.io/api/access');
    expect(opts.method).to.equal('GET');
    expect(opts.headers).to.deep.equal({
      authorization: 'Bearer selected-org-token',
      'x-tenant-id': orgId,
      'x-api-key': 'darkalley',
      accept: 'application/json',
    });
    expect(opts.body).to.equal(undefined);
    expect(opts.cache).to.equal('no-store');
  });

  it('uses the AO fallback host when the selected org has no location', async () => {
    setMockIms({ projectedProductContext: [{ prodCtx: { owningEntity: orgId } }] });
    expect(await checkCoworkerAccess()).to.deep.equal({ allowed: true });
    expect(calls[0].url).to.equal('https://agent-orchestrator-prod-va7.adobe.io/api/access');
  });

  it('does not request access without a configured IMS client', async () => {
    setMockIms({ imsClientId: null });
    expect(await checkCoworkerAccess()).to.deep.equal({ error: 'configuration' });
    expect(calls).to.have.length(0);
  });

  it('reports an explicit denial separately from a failed check', async () => {
    body = response(false);
    expect(await checkCoworkerAccess()).to.deep.equal({ allowed: false });
  });

  [401, 403, 500, 503].forEach((httpStatus) => {
    it(`reports HTTP ${httpStatus} as an error, not a decision`, async () => {
      status = httpStatus;
      expect(await checkCoworkerAccess()).to.deep.equal({ error: 'http', status });
    });
  });

  [
    {},
    null,
    { allowed: null },
    { allowed: 'true' },
    { allowed: 'false' },
    { allowed: 1 },
    { allowed: 'permit' },
    { responses: [{ resource: { uri }, action: 'use', effect: 'permit' }] },
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
    it(`uses the same AO environment as chat for ${JSON.stringify(location)}`, async () => {
      setMockIms({ projectedProductContext: context(location) });
      expect(await checkCoworkerAccess()).to.deep.equal({ allowed: true });
      expect(calls[0].url)
        .to.equal(`https://agent-orchestrator-${location.environment.toLowerCase()}-can2.adobe.io/api/access`);
    });
  });

  it('shares concurrent checks but does not cache completed decisions', async () => {
    const results = await Promise.all([checkCoworkerAccess(), checkCoworkerAccess()]);
    expect(results).to.deep.equal([{ allowed: true }, { allowed: true }]);
    expect(calls).to.have.length(1);
    body = response(false);
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

  it('separates in-flight checks by org, token, AO region, and IMS client', async () => {
    const pending = [];
    const started = [];
    const nextRequest = () => new Promise((resolve) => { started.push(resolve); });
    window.fetch = (url, opts) => {
      calls.push({ url, opts });
      started.shift()();
      return new Promise((resolve) => { pending.push(resolve); });
    };
    const firstStarted = nextRequest();
    const first = checkCoworkerAccess();
    await firstStarted;
    setMockIms({ projectedProductContext: context({ org: 'other@AdobeOrg' }) });
    const secondStarted = nextRequest();
    const second = checkCoworkerAccess();
    await secondStarted;
    setMockIms({ token: { token: 'refreshed-token' } });
    const thirdStarted = nextRequest();
    const third = checkCoworkerAccess();
    await thirdStarted;
    setMockIms({ projectedProductContext: context({ org: 'other@AdobeOrg', region: 'NEW1' }) });
    const fourthStarted = nextRequest();
    const fourth = checkCoworkerAccess();
    await fourthStarted;
    setMockIms({ imsClientId: 'another-client' });
    const fifthStarted = nextRequest();
    const fifth = checkCoworkerAccess();
    await fifthStarted;
    expect(calls).to.have.length(5);
    expect(calls[4].opts.headers['x-api-key']).to.equal('another-client');
    pending.forEach((resolve) => resolve(new Response(JSON.stringify(response()))));
    expect(await Promise.all([first, second, third, fourth, fifth]))
      .to.deep.equal([
        { allowed: true },
        { allowed: true },
        { allowed: true },
        { allowed: true },
        { allowed: true },
      ]);
  });
});
