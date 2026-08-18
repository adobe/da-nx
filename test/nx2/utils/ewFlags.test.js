import { expect } from '@esm-bundle/chai';
import { HLX_ADMIN } from '../../../nx2/utils/utils.js';
import {
  calls, installFetch, restoreFetch,
} from '../../../nx2/test/mocks/fetch.js';
import {
  getEWFlags, isEWEnabled, isEwChatDisabled, isCoworkerEnabled,
} from '../../../nx2/utils/ewFlags.js';

// getEWFlags -> daConfig.fetchDaConfigs -> api.js's config.get(), which
// probes isHlx6 (HLX_ADMIN/ping/...) before hitting the (legacy) config
// endpoint. `installFetch` (shared with api.test.js) handles that ping
// automatically for the single-response cases below. Where org and site
// need different bodies, window.fetch is assigned directly after
// restoreFetch() — same pattern api.test.js uses for its multi-response
// scenarios.
const installFlagsByPath = (byPath) => {
  restoreFetch();
  calls.length = 0;
  window.fetch = async (url) => {
    const u = url.toString();
    calls.push({ url: u, method: 'GET' });
    if (u.includes(`${HLX_ADMIN}/ping/`)) return new Response('', { status: 200 });
    const match = Object.keys(byPath).find((path) => u.includes(path));
    const body = match ? byPath[match] : JSON.stringify({ flags: { data: [] } });
    return new Response(body, { status: 200 });
  };
};

describe('getEWFlags', () => {
  afterEach(() => restoreFetch());

  it('returns all ew.* flags merged from org and site configs', async () => {
    installFlagsByPath({
      '/flag-site1/': JSON.stringify({ flags: { data: [{ key: 'ew.canvasDefaultView', value: 'split' }] } }),
      '/flag-org1/': JSON.stringify({ flags: { data: [{ key: 'ew.enabled', value: 'true' }] } }),
    });
    const flags = await getEWFlags({ org: 'flag-org1', site: 'flag-site1' });
    expect(flags).to.deep.equal({ 'ew.enabled': 'true', 'ew.canvasDefaultView': 'split' });
  });

  it('site level flag overrides org level flag', async () => {
    installFlagsByPath({
      '/flag-site2/': JSON.stringify({ flags: { data: [{ key: 'ew.enabled', value: 'false' }] } }),
      '/flag-org2/': JSON.stringify({ flags: { data: [{ key: 'ew.enabled', value: 'true' }] } }),
    });
    const flags = await getEWFlags({ org: 'flag-org2', site: 'flag-site2' });
    expect(flags['ew.enabled']).to.equal('false');
  });

  it('returns empty object when no ew.* flags are present', async () => {
    installFetch({ body: JSON.stringify({ flags: { data: [] } }) });
    expect(await getEWFlags({ org: 'flag-org3', site: 'flag-site3' })).to.deep.equal({});
  });

  it('ignores non-ew.* flags', async () => {
    installFetch({ body: JSON.stringify({ flags: { data: [{ key: 'other.flag', value: 'true' }] } }) });
    expect(await getEWFlags({ org: 'flag-org4', site: 'flag-site4' })).to.deep.equal({});
  });
});

describe('isEWEnabled', () => {
  afterEach(() => restoreFetch());

  it('returns true when ew.enabled flag value is "true"', async () => {
    installFlagsByPath({
      '/ew-site1/': JSON.stringify({ flags: { data: [{ key: 'ew.enabled', value: 'true' }] } }),
    });
    expect(await isEWEnabled({ org: 'ew-org1', site: 'ew-site1' })).to.be.true;
  });

  it('returns false when ew.enabled flag value is "false"', async () => {
    installFlagsByPath({
      '/ew-site2/': JSON.stringify({ flags: { data: [{ key: 'ew.enabled', value: 'false' }] } }),
    });
    expect(await isEWEnabled({ org: 'ew-org2', site: 'ew-site2' })).to.be.false;
  });
});

describe('isEwChatDisabled', () => {
  afterEach(() => restoreFetch());

  it('returns true when ew.disableChat is set at org level but not site level', async () => {
    installFlagsByPath({
      '/dc-site1/': JSON.stringify({ flags: { data: [] } }),
      '/dc-org1/': JSON.stringify({ flags: { data: [{ key: 'ew.disableChat', value: 'true' }] } }),
    });
    expect(await isEwChatDisabled({ org: 'dc-org1', site: 'dc-site1' })).to.be.true;
  });

  it('returns true when ew.disableChat is set at site level but not org level', async () => {
    installFlagsByPath({
      '/dc-site2/': JSON.stringify({ flags: { data: [{ key: 'ew.disableChat', value: 'true' }] } }),
      '/dc-org2/': JSON.stringify({ flags: { data: [] } }),
    });
    expect(await isEwChatDisabled({ org: 'dc-org2', site: 'dc-site2' })).to.be.true;
  });

  it('returns false when ew.disableChat flag is not set at any level', async () => {
    installFetch({ body: JSON.stringify({ flags: { data: [] } }) });
    expect(await isEwChatDisabled({ org: 'dc-org3', site: 'dc-site3' })).to.be.false;
  });
});

describe('isCoworkerEnabled', () => {
  afterEach(() => restoreFetch());

  it('returns true when ew.coworker flag value is "true"', async () => {
    installFlagsByPath({
      '/cw-site1/': JSON.stringify({ flags: { data: [{ key: 'ew.coworker', value: 'true' }] } }),
    });
    expect(await isCoworkerEnabled({ org: 'cw-org1', site: 'cw-site1' })).to.be.true;
  });

  it('returns false when ew.coworker flag is not set at any level', async () => {
    installFetch({ body: JSON.stringify({ flags: { data: [] } }) });
    expect(await isCoworkerEnabled({ org: 'cw-org2', site: 'cw-site2' })).to.be.false;
  });
});
