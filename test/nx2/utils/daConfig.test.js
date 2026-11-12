import { expect } from '@esm-bundle/chai';
import {
  AEM_API, DA_ADMIN, HLX_ADMIN, object2sheet, getFirstSheet as getSharedFirstSheet,
} from '../../../nx2/utils/utils.js';
import {
  calls, installFetch, restoreFetch, lastCall,
} from '../../../nx2/test/mocks/fetch.js';
import { getFirstSheet, fetchDaConfigs, getConfigValue } from '../../../nx2/utils/daConfig.js';

// fetchDaConfigs memoizes per `/{org}` and `/{org}/{site}` key for the
// lifetime of the module, so every test uses a fresh org/site pair to avoid
// bleeding cache state across assertions.
let counter = 0;
const uniq = (label) => {
  counter += 1;
  return `${label}-${counter}`;
};

describe('getFirstSheet', () => {
  it('re-exports the shared helper, including its handling of missing data', () => {
    expect(getFirstSheet).to.equal(getSharedFirstSheet);
    expect(getFirstSheet(null)).to.equal(undefined);
    expect(getFirstSheet({})).to.equal(undefined);
  });

  it('returns .data for a single-sheet doc', () => {
    const json = { ':type': 'sheet', ':sheetname': 'flags', data: [{ key: 'a' }] };
    expect(getFirstSheet(json)).to.deep.equal([{ key: 'a' }]);
  });

  it('returns the first sheet\'s data for a multi-sheet doc', () => {
    const json = {
      ':type': 'multi-sheet',
      ':names': ['flags', 'prompts'],
      ':version': 3,
      flags: { data: [{ key: 'a' }] },
      prompts: { data: [{ title: 'hi' }] },
    };
    expect(getFirstSheet(json)).to.deep.equal([{ key: 'a' }]);
  });

  it('reads object2sheet output with metadata keys first', () => {
    const rows = [{ key: 'ew.wysiwygBranch', value: '/org/site=develop' }];
    const json = object2sheet({ config: rows, flags: [] });
    expect(Object.keys(json).slice(0, 2)).to.deep.equal([':type', ':names']);
    expect(getFirstSheet(json)).to.deep.equal(rows);
  });

  it('uses the declared sheet order rather than the object key order', () => {
    const json = {
      ':type': 'multi-sheet',
      ':names': ['config', 'flags'],
      flags: { data: [{ key: 'flag' }] },
      config: { data: [{ key: 'config' }] },
    };
    expect(getFirstSheet(json)).to.deep.equal([{ key: 'config' }]);
  });
});

describe('fetchDaConfigs', () => {
  afterEach(() => restoreFetch());

  it('legacy: fetches org-only config from DA_ADMIN when no site is given', async () => {
    const org = uniq('org');
    installFetch({ body: JSON.stringify({ flags: { data: [{ key: 'ew.enabled', value: 'true' }] } }) });

    const [orgConfig] = await Promise.all(fetchDaConfigs({ org }));

    expect(lastCall().url).to.equal(`${DA_ADMIN}/config/${org}/`);
    expect(orgConfig.flags.data).to.deep.equal([{ key: 'ew.enabled', value: 'true' }]);
  });

  it('legacy: fetches both org and site config, site resolves as the last entry', async () => {
    const org = uniq('org');
    const site = uniq('site');
    restoreFetch();
    calls.length = 0;
    window.fetch = async (url) => {
      const u = url.toString();
      calls.push({ url: u, method: 'GET' });
      if (u.includes(`${HLX_ADMIN}/ping/`)) return new Response('', { status: 200 });
      if (u.includes(`/${org}/${site}/`)) {
        return new Response(JSON.stringify({ flags: { data: [{ key: 'site' }] } }), { status: 200 });
      }
      return new Response(JSON.stringify({ flags: { data: [{ key: 'org' }] } }), { status: 200 });
    };

    const configs = fetchDaConfigs({ org, site });
    expect(configs).to.have.length(2);
    const [orgConfig, siteConfig] = await Promise.all(configs);

    expect(orgConfig.flags.data).to.deep.equal([{ key: 'org' }]);
    expect(siteConfig.flags.data).to.deep.equal([{ key: 'site' }]);
  });

  it('memoizes: a second call with the same org/site does not re-fetch', async () => {
    const org = uniq('org');
    const site = uniq('site');
    installFetch({ body: JSON.stringify({ flags: { data: [] } }) });

    await Promise.all(fetchDaConfigs({ org, site }));
    const callsAfterFirst = calls.length;
    await Promise.all(fetchDaConfigs({ org, site }));

    expect(calls.length).to.equal(callsAfterFirst);
  });

  it('on a non-ok response, returns { error, status } and evicts the cache entry so a later call retries', async () => {
    const org = uniq('org');
    installFetch({ status: 404, body: '' });

    const [failed] = await Promise.all(fetchDaConfigs({ org }));
    expect(failed.error).to.be.a('string');
    expect(failed.status).to.equal(404);

    restoreFetch();
    installFetch({ body: JSON.stringify({ flags: { data: [{ key: 'retried' }] } }) });
    const [retried] = await Promise.all(fetchDaConfigs({ org }));
    expect(retried.flags.data).to.deep.equal([{ key: 'retried' }]);
  });

  it('hlx6: site config is fetched from AEM_API and normalized back into sheet format', async () => {
    const org = uniq('org');
    const site = uniq('site');
    installFetch({ pingHlx6: true, body: JSON.stringify({ flags: [{ key: 'ew.enabled', value: 'true' }] }) });

    const [orgConfig, siteConfig] = await Promise.all(fetchDaConfigs({ org, site }));

    expect(orgConfig).to.equal(null);
    expect(calls.filter((c) => c.url.startsWith(DA_ADMIN))).to.have.lengthOf(0);
    expect(calls.some((c) => c.url === `${AEM_API}/${org}/sites/${site}/config/editor/da.json`)).to.equal(true);
    expect(siteConfig[':type']).to.equal('sheet');
    expect(siteConfig[':sheetname']).to.equal('flags');
    expect(siteConfig.data).to.deep.equal([{ key: 'ew.enabled', value: 'true' }]);
  });

  it('hlx6: concurrent and repeated callers make one probe and one site-config request', async () => {
    const org = uniq('hlx6-concurrent');
    const site = uniq('site');
    installFetch({ pingHlx6: true, body: JSON.stringify({ config: [] }) });

    const results = await Promise.all([
      Promise.all(fetchDaConfigs({ org, site })),
      Promise.all(fetchDaConfigs({ org, site })),
    ]);
    expect(await Promise.all(fetchDaConfigs({ org, site }))).to.deep.equal(results[0]);
    expect(results[0]).to.deep.equal(results[1]);
    expect(calls.map((call) => call.url)).to.deep.equal([
      `${HLX_ADMIN}/ping/${org}/${site}`,
      `${AEM_API}/${org}/sites/${site}/config/editor/da.json`,
    ]);
  });

  it('hlx6: does not cache the skipped org config for org-only or legacy callers', async () => {
    const org = uniq('mixed-backends');
    const site = uniq('hlx6-site');
    installFetch({ pingHlx6: true, body: JSON.stringify({ config: [] }) });
    const [skipped] = await Promise.all(fetchDaConfigs({ org, site }));
    expect(skipped).to.equal(null);

    restoreFetch();
    installFetch({ body: JSON.stringify({ data: [{ key: 'legacy' }] }) });
    const [orgConfig] = await Promise.all(fetchDaConfigs({ org }));
    const [legacyOrg] = await Promise.all(fetchDaConfigs({ org, site: uniq('legacy-site') }));
    const [hlx6Org] = await Promise.all(fetchDaConfigs({ org, site }));
    expect(orgConfig.data).to.deep.equal([{ key: 'legacy' }]);
    expect(legacyOrg).to.equal(orgConfig);
    expect(hlx6Org).to.equal(null);
    expect(calls.filter((call) => call.url === `${DA_ADMIN}/config/${org}/`)).to.have.lengthOf(1);
  });

  it('hlx6: reports a failed site config without falling back to legacy config', async () => {
    const org = uniq('hlx6-failed');
    const site = uniq('site');
    installFetch({ pingHlx6: true, status: 403 });
    const [orgConfig, siteConfig] = await Promise.all(fetchDaConfigs({ org, site }));
    expect(orgConfig).to.equal(null);
    expect(siteConfig).to.deep.equal({ error: `Error loading /${org}/${site}`, status: 403 });
    expect(calls.filter((call) => call.url.startsWith(DA_ADMIN))).to.have.lengthOf(0);
  });

  it('hlx6: reads the primary config sheet after multi-sheet conversion', async () => {
    const org = uniq('multi-sheet-org');
    const site = uniq('multi-sheet-site');
    const rows = [{ key: 'ew.wysiwygBranch', value: `/${org}/${site}=develop` }];
    installFetch({ pingHlx6: true, body: JSON.stringify({ config: rows, flags: [] }) });

    const [, siteConfig] = await Promise.all(fetchDaConfigs({ org, site }));

    expect(Object.keys(siteConfig).slice(0, 2)).to.deep.equal([':type', ':names']);
    expect(getFirstSheet(siteConfig)).to.deep.equal(rows);
  });

  it('evicts rejected config promises so a later call retries', async () => {
    const org = uniq('retry-org');
    installFetch({ body: '{invalid json' });
    let error;
    try {
      await Promise.all(fetchDaConfigs({ org }));
    } catch (e) {
      error = e;
    }
    expect(error).to.be.instanceOf(SyntaxError);

    restoreFetch();
    installFetch({ body: JSON.stringify({ data: [{ key: 'retried' }] }) });
    const [retried] = await Promise.all(fetchDaConfigs({ org }));
    expect(getFirstSheet(retried)).to.deep.equal([{ key: 'retried' }]);
  });
});

describe('getConfigValue', () => {
  afterEach(() => restoreFetch());

  const sheet = (data) => JSON.stringify({ ':type': 'sheet', data });

  it('returns the value for the key', async () => {
    installFetch({ body: sheet([{ key: 'a', value: '1' }, { key: 'b', value: '2' }]) });
    expect(await getConfigValue({ org: uniq('org'), key: 'b' })).to.equal('2');
  });

  it('returns undefined when the key is missing', async () => {
    installFetch({ body: sheet([{ key: 'a', value: '1' }]) });
    expect(await getConfigValue({ org: uniq('org'), key: 'b' })).to.equal(undefined);
  });

  it('returns undefined when the config fails to load', async () => {
    installFetch({ status: 404, body: '' });
    expect(await getConfigValue({ org: uniq('org'), key: 'a' })).to.equal(undefined);
  });

  it('site config overrides org config', async () => {
    const org = uniq('org');
    const site = uniq('site');
    installFetch();
    window.fetch = async (url) => {
      const u = url.toString();
      if (u.includes(`${HLX_ADMIN}/ping/`)) return new Response('', { status: 200 });
      const value = u.includes(`/${org}/${site}/`) ? 'site' : 'org';
      return new Response(sheet([{ key: 'a', value }]), { status: 200 });
    };

    expect(await getConfigValue({ org, site, key: 'a' })).to.equal('site');
  });

  it('falls back to org config when the site does not set the key', async () => {
    const org = uniq('org');
    const site = uniq('site');
    installFetch();
    window.fetch = async (url) => {
      const u = url.toString();
      if (u.includes(`${HLX_ADMIN}/ping/`)) return new Response('', { status: 200 });
      const data = u.includes(`/${org}/${site}/`) ? [] : [{ key: 'a', value: 'org' }];
      return new Response(sheet(data), { status: 200 });
    };

    expect(await getConfigValue({ org, site, key: 'a' })).to.equal('org');
  });

  it('does not fall back to a cached legacy org value for an hlx6 site', async () => {
    const org = uniq('hlx6-no-inheritance');
    const site = uniq('site');
    installFetch({ body: sheet([{ key: 'a', value: 'org' }]) });
    expect(await getConfigValue({ org, key: 'a' })).to.equal('org');

    restoreFetch();
    installFetch({ pingHlx6: true, body: JSON.stringify({ config: [] }) });
    expect(await getConfigValue({ org, site, key: 'a' })).to.equal(undefined);
    expect(calls.filter((call) => call.url.startsWith(DA_ADMIN))).to.have.lengthOf(0);
  });
});
