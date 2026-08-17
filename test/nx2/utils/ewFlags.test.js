import { expect } from '@esm-bundle/chai';
import { HLX_ADMIN } from '../../../nx2/utils/utils.js';
import {
  getEWFlags, isEWEnabled, isEwChatDisabled, isCoworkerEnabled,
} from '../../../nx2/utils/ewFlags.js';

// `config.get` (used internally by ewFlags -> daConfig -> api.js) probes
// `isHlx6` with a ping request before hitting the config endpoint. Responses
// must be real `Response` objects so `resp.headers.get(...)` works.
const installFetch = (siteFlagsByPath) => {
  window.fetch = async (url) => {
    const u = url.toString();
    if (u.includes(`${HLX_ADMIN}/ping/`)) return new Response('', { status: 200 });
    const match = Object.keys(siteFlagsByPath).find((path) => u.includes(path));
    const body = match ? siteFlagsByPath[match] : { flags: { data: [] } };
    return new Response(JSON.stringify(body), { status: 200 });
  };
};

describe('getEWFlags', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('returns all ew.* flags merged from org and site configs', async () => {
    installFetch({
      '/flag-site1/': { flags: { data: [{ key: 'ew.canvasDefaultView', value: 'split' }] } },
      '/flag-org1/': { flags: { data: [{ key: 'ew.enabled', value: 'true' }] } },
    });
    const flags = await getEWFlags({ org: 'flag-org1', site: 'flag-site1' });
    expect(flags).to.deep.equal({ 'ew.enabled': 'true', 'ew.canvasDefaultView': 'split' });
  });

  it('site level flag overrides org level flag', async () => {
    installFetch({
      '/flag-site2/': { flags: { data: [{ key: 'ew.enabled', value: 'false' }] } },
      '/flag-org2/': { flags: { data: [{ key: 'ew.enabled', value: 'true' }] } },
    });
    const flags = await getEWFlags({ org: 'flag-org2', site: 'flag-site2' });
    expect(flags['ew.enabled']).to.equal('false');
  });

  it('returns empty object when no ew.* flags are present', async () => {
    installFetch({});
    expect(await getEWFlags({ org: 'flag-org3', site: 'flag-site3' })).to.deep.equal({});
  });

  it('ignores non-ew.* flags', async () => {
    installFetch({
      '/flag-org4/': { flags: { data: [{ key: 'other.flag', value: 'true' }] } },
    });
    expect(await getEWFlags({ org: 'flag-org4', site: 'flag-site4' })).to.deep.equal({});
  });
});

describe('isEWEnabled', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('returns true when ew.enabled flag value is "true"', async () => {
    installFetch({
      '/ew-site1/': { flags: { data: [{ key: 'ew.enabled', value: 'true' }] } },
    });
    expect(await isEWEnabled({ org: 'ew-org1', site: 'ew-site1' })).to.be.true;
  });

  it('returns false when ew.enabled flag value is "false"', async () => {
    installFetch({
      '/ew-site2/': { flags: { data: [{ key: 'ew.enabled', value: 'false' }] } },
    });
    expect(await isEWEnabled({ org: 'ew-org2', site: 'ew-site2' })).to.be.false;
  });
});

describe('isEwChatDisabled', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('returns true when ew.disableChat is set at org level but not site level', async () => {
    installFetch({
      '/dc-site1/': { flags: { data: [] } },
      '/dc-org1/': { flags: { data: [{ key: 'ew.disableChat', value: 'true' }] } },
    });
    expect(await isEwChatDisabled({ org: 'dc-org1', site: 'dc-site1' })).to.be.true;
  });

  it('returns true when ew.disableChat is set at site level but not org level', async () => {
    installFetch({
      '/dc-site2/': { flags: { data: [{ key: 'ew.disableChat', value: 'true' }] } },
      '/dc-org2/': { flags: { data: [] } },
    });
    expect(await isEwChatDisabled({ org: 'dc-org2', site: 'dc-site2' })).to.be.true;
  });

  it('returns false when ew.disableChat flag is not set at any level', async () => {
    installFetch({});
    expect(await isEwChatDisabled({ org: 'dc-org3', site: 'dc-site3' })).to.be.false;
  });
});

describe('isCoworkerEnabled', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('returns true when ew.coworker flag value is "true"', async () => {
    installFetch({
      '/cw-site1/': { flags: { data: [{ key: 'ew.coworker', value: 'true' }] } },
    });
    expect(await isCoworkerEnabled({ org: 'cw-org1', site: 'cw-site1' })).to.be.true;
  });

  it('returns false when ew.coworker flag is not set at any level', async () => {
    installFetch({});
    expect(await isCoworkerEnabled({ org: 'cw-org2', site: 'cw-site2' })).to.be.false;
  });
});
