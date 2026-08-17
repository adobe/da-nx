import { expect } from '@esm-bundle/chai';
import { installFetch } from '../../../nx2/test/mocks/fetch.js';
import {
  getEWFlags, isEWEnabled, isEwChatDisabled, isCoworkerEnabled,
} from '../../../nx2/utils/ewFlags.js';

// getEWFlags -> daConfig.fetchDaConfigs -> api.js's config.get(), which
// probes isHlx6 (HLX_ADMIN/ping/...) before hitting the (legacy) config
// endpoint. installFetch handles that ping automatically.
describe('getEWFlags', () => {
  let fetchCtl;
  afterEach(() => fetchCtl?.restore());

  it('returns all ew.* flags merged from org and site configs', async () => {
    fetchCtl = installFetch({
      routes: [
        { match: '/flag-site1/', body: JSON.stringify({ flags: { data: [{ key: 'ew.canvasDefaultView', value: 'split' }] } }) },
        { match: '/flag-org1/', body: JSON.stringify({ flags: { data: [{ key: 'ew.enabled', value: 'true' }] } }) },
      ],
    });
    const flags = await getEWFlags({ org: 'flag-org1', site: 'flag-site1' });
    expect(flags).to.deep.equal({ 'ew.enabled': 'true', 'ew.canvasDefaultView': 'split' });
  });

  it('site level flag overrides org level flag', async () => {
    fetchCtl = installFetch({
      routes: [
        { match: '/flag-site2/', body: JSON.stringify({ flags: { data: [{ key: 'ew.enabled', value: 'false' }] } }) },
        { match: '/flag-org2/', body: JSON.stringify({ flags: { data: [{ key: 'ew.enabled', value: 'true' }] } }) },
      ],
    });
    const flags = await getEWFlags({ org: 'flag-org2', site: 'flag-site2' });
    expect(flags['ew.enabled']).to.equal('false');
  });

  it('returns empty object when no ew.* flags are present', async () => {
    fetchCtl = installFetch({ fallback: { body: JSON.stringify({ flags: { data: [] } }) } });
    expect(await getEWFlags({ org: 'flag-org3', site: 'flag-site3' })).to.deep.equal({});
  });

  it('ignores non-ew.* flags', async () => {
    fetchCtl = installFetch({
      routes: [
        { match: '/flag-org4/', body: JSON.stringify({ flags: { data: [{ key: 'other.flag', value: 'true' }] } }) },
      ],
      fallback: { body: JSON.stringify({ flags: { data: [] } }) },
    });
    expect(await getEWFlags({ org: 'flag-org4', site: 'flag-site4' })).to.deep.equal({});
  });
});

describe('isEWEnabled', () => {
  let fetchCtl;
  afterEach(() => fetchCtl?.restore());

  it('returns true when ew.enabled flag value is "true"', async () => {
    fetchCtl = installFetch({
      routes: [
        { match: '/ew-site1/', body: JSON.stringify({ flags: { data: [{ key: 'ew.enabled', value: 'true' }] } }) },
      ],
      fallback: { body: JSON.stringify({}) },
    });
    expect(await isEWEnabled({ org: 'ew-org1', site: 'ew-site1' })).to.be.true;
  });

  it('returns false when ew.enabled flag value is "false"', async () => {
    fetchCtl = installFetch({
      routes: [
        { match: '/ew-site2/', body: JSON.stringify({ flags: { data: [{ key: 'ew.enabled', value: 'false' }] } }) },
      ],
      fallback: { body: JSON.stringify({}) },
    });
    expect(await isEWEnabled({ org: 'ew-org2', site: 'ew-site2' })).to.be.false;
  });
});

describe('isEwChatDisabled', () => {
  let fetchCtl;
  afterEach(() => fetchCtl?.restore());

  it('returns true when ew.disableChat is set at org level but not site level', async () => {
    fetchCtl = installFetch({
      routes: [
        { match: '/dc-site1/', body: JSON.stringify({ flags: { data: [] } }) },
        { match: '/dc-org1/', body: JSON.stringify({ flags: { data: [{ key: 'ew.disableChat', value: 'true' }] } }) },
      ],
    });
    expect(await isEwChatDisabled({ org: 'dc-org1', site: 'dc-site1' })).to.be.true;
  });

  it('returns true when ew.disableChat is set at site level but not org level', async () => {
    fetchCtl = installFetch({
      routes: [
        { match: '/dc-site2/', body: JSON.stringify({ flags: { data: [{ key: 'ew.disableChat', value: 'true' }] } }) },
        { match: '/dc-org2/', body: JSON.stringify({ flags: { data: [] } }) },
      ],
    });
    expect(await isEwChatDisabled({ org: 'dc-org2', site: 'dc-site2' })).to.be.true;
  });

  it('returns false when ew.disableChat flag is not set at any level', async () => {
    fetchCtl = installFetch({ fallback: { body: JSON.stringify({ flags: { data: [] } }) } });
    expect(await isEwChatDisabled({ org: 'dc-org3', site: 'dc-site3' })).to.be.false;
  });
});

describe('isCoworkerEnabled', () => {
  let fetchCtl;
  afterEach(() => fetchCtl?.restore());

  it('returns true when ew.coworker flag value is "true"', async () => {
    fetchCtl = installFetch({
      routes: [
        { match: '/cw-site1/', body: JSON.stringify({ flags: { data: [{ key: 'ew.coworker', value: 'true' }] } }) },
      ],
      fallback: { body: JSON.stringify({}) },
    });
    expect(await isCoworkerEnabled({ org: 'cw-org1', site: 'cw-site1' })).to.be.true;
  });

  it('returns false when ew.coworker flag is not set at any level', async () => {
    fetchCtl = installFetch({ fallback: { body: JSON.stringify({ flags: { data: [] } }) } });
    expect(await isCoworkerEnabled({ org: 'cw-org2', site: 'cw-site2' })).to.be.false;
  });
});
