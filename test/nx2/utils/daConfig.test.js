import { expect } from '@esm-bundle/chai';
import { AEM_API, DA_ADMIN, HLX_ADMIN } from '../../../nx2/utils/utils.js';
import {
  calls, installFetch, restoreFetch, lastCall,
} from '../../../nx2/test/mocks/fetch.js';
import { getFirstSheet, fetchDaConfigs } from '../../../nx2/utils/daConfig.js';

// fetchDaConfigs memoizes per `/{org}` and `/{org}/{site}` key for the
// lifetime of the module, so every test uses a fresh org/site pair to avoid
// bleeding cache state across assertions.
let counter = 0;
const uniq = (label) => {
  counter += 1;
  return `${label}-${counter}`;
};

describe('getFirstSheet', () => {
  it('returns .data for a single-sheet doc', () => {
    const json = { ':type': 'sheet', ':sheetname': 'flags', data: [{ key: 'a' }] };
    expect(getFirstSheet(json)).to.deep.equal([{ key: 'a' }]);
  });

  it('returns the first sheet\'s data for a multi-sheet doc', () => {
    const json = {
      ':type': 'multi-sheet',
      ':names': ['flags', 'prompts'],
      flags: { data: [{ key: 'a' }] },
      prompts: { data: [{ title: 'hi' }] },
    };
    expect(getFirstSheet(json)).to.deep.equal([{ key: 'a' }]);
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

    const [, siteConfig] = await Promise.all(fetchDaConfigs({ org, site }));

    expect(calls.some((c) => c.url === `${AEM_API}/${org}/sites/${site}/config/editor/da.json`)).to.equal(true);
    expect(siteConfig[':type']).to.equal('sheet');
    expect(siteConfig[':sheetname']).to.equal('flags');
    expect(siteConfig.data).to.deep.equal([{ key: 'ew.enabled', value: 'true' }]);
  });
});
