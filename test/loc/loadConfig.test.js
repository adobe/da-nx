import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setImsDetails } from '../../nx/utils/daFetch.js';
import { loadConfig } from '../../nx/blocks/loc/utils/utils.js';

const makeResp = (status, body = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(),
  json: async () => body,
});

const configOf = (marker) => ({ config: { data: [{ key: 'marker', value: marker }] } });

/**
 * Stub fetch: `translate` maps a site (or '' for the org) to its config marker,
 * `msm` is the MSM sheet rows (a number simulates a failed MSM read).
 */
function stubFetch({ org, translate = {}, msm = [] }) {
  globalThis.fetch = sinon.stub().callsFake((url) => {
    if (url.includes('/config/')) {
      if (typeof msm === 'number') return Promise.resolve(makeResp(msm));
      return Promise.resolve(makeResp(200, { msm: { data: msm } }));
    }
    const match = Object.keys(translate).find((site) => {
      const prefix = site ? `/source/${org}/${site}/.da/` : `/source/${org}/.da/`;
      return url.includes(prefix);
    });
    return Promise.resolve(match === undefined
      ? makeResp(404)
      : makeResp(200, configOf(translate[match])));
  });
}

const markerOf = (options) => options.config.data[0]?.value;
const calledSites = (org) => globalThis.fetch.args
  .map(([url]) => url)
  .filter((url) => url.includes('/.da/translate.json'))
  .map((url) => url.split(`/source/${org}/`)[1].split('/.da/')[0]);

describe('loadConfig', () => {
  let originalFetch;

  beforeEach(() => {
    setImsDetails('test-token');
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    sinon.restore();
  });

  it('uses the site config without consulting MSM', async () => {
    stubFetch({ org: 'own-org', translate: { sat: 'sat', base: 'base' } });
    const options = await loadConfig({ org: 'own-org', site: 'sat' });
    expect(markerOf(options)).to.equal('sat');
    expect(globalThis.fetch.args.some(([url]) => url.includes('/config/'))).to.be.false;
  });

  it('falls back to the MSM source site config', async () => {
    const msm = [{ base: 'base', satellite: 'sat' }];
    stubFetch({ org: 'src-org', translate: { base: 'base', '': 'org' }, msm });
    const options = await loadConfig({ org: 'src-org', site: 'sat' });
    expect(markerOf(options)).to.equal('base');
  });

  it('uses the nearest source site that has a config', async () => {
    const msm = [
      { base: 'mid', satellite: 'sat' },
      { base: 'root', satellite: 'mid' },
    ];
    stubFetch({ org: 'chain-org', translate: { root: 'root' }, msm });
    const options = await loadConfig({ org: 'chain-org', site: 'sat' });
    expect(markerOf(options)).to.equal('root');
    expect(calledSites('chain-org')).to.deep.equal(['sat', 'mid', 'root']);
  });

  it('prefers the MSM source config over the org config', async () => {
    const msm = [{ base: 'base', satellite: 'sat' }];
    stubFetch({ org: 'pref-org', translate: { base: 'base', '': 'org' }, msm });
    const options = await loadConfig({ org: 'pref-org', site: 'sat' });
    expect(markerOf(options)).to.equal('base');
  });

  it('falls back to the org config when no source site has one', async () => {
    const msm = [{ base: 'base', satellite: 'sat' }];
    stubFetch({ org: 'orgcfg-org', translate: { '': 'org' }, msm });
    const options = await loadConfig({ org: 'orgcfg-org', site: 'sat' });
    expect(markerOf(options)).to.equal('org');
  });

  it('does not use the config of a site that is not an ancestor', async () => {
    const msm = [{ base: 'base', satellite: 'sat' }];
    stubFetch({ org: 'dir-org', translate: { sat: 'sat', '': 'org' }, msm });
    const options = await loadConfig({ org: 'dir-org', site: 'base' });
    expect(markerOf(options)).to.equal('org');
  });

  it('continues to the org config when the MSM read fails', async () => {
    stubFetch({ org: 'fail-org', translate: { '': 'org' }, msm: 403 });
    const options = await loadConfig({ org: 'fail-org', site: 'sat' });
    expect(markerOf(options)).to.equal('org');
  });
});
