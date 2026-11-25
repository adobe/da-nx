import { expect } from '@esm-bundle/chai';
import {
  AEM_API, DA_ADMIN, calls, installFetch, makeSite, restoreFetch,
} from './mock-fetch.js';

const UTILS = '../../../nx/blocks/loc/utils/utils.js';
let fresh = 0;

// fetchConfig caches in module scope, so every test gets its own module instance.
async function loadFetchConfig() {
  fresh += 1;
  const { fetchConfig } = await import(`${UTILS}?fresh=${fresh}`);
  return fetchConfig;
}

const json = (body) => new Response(JSON.stringify(body), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

describe('fetchConfig', () => {
  afterEach(() => restoreFetch());

  it('reads the site translate.json from the source bus on Helix 6', async () => {
    const { org, site } = makeSite({ hlx6: true });
    installFetch(({ url }) => (url.startsWith(AEM_API)
      ? json({ config: { data: [{ key: 'from', value: 'site' }] } })
      : new Response('', { status: 404 })));
    const fetchConfig = await loadFetchConfig();
    const options = await fetchConfig(org, site);
    expect(calls[0].url).to.equal(`${AEM_API}/${org}/sites/${site}/source/.da/translate.json`);
    expect(options.config.data[0].value).to.equal('site');
  });

  it('skips the legacy org-level fallback on Helix 6 and uses the built-in defaults', async () => {
    const { org, site } = makeSite({ hlx6: true });
    installFetch(({ url }) => (url.startsWith(DA_ADMIN)
      ? json({ config: { data: [{ key: 'from', value: 'org' }] } })
      : new Response('', { status: 404 })));
    const fetchConfig = await loadFetchConfig();
    const options = await fetchConfig(org, site);
    expect(calls.map(({ url }) => url)).to.deep.equal([
      `${AEM_API}/${org}/sites/${site}/source/.da/translate.json`,
    ]);
    const service = options.config.data.find(({ key }) => key === 'translation.service.name');
    expect(service.value).to.equal('Google');
  });

  it('keeps the org-level fallback on legacy DA sites', async () => {
    const { org, site } = makeSite();
    installFetch(({ url }) => (url === `${DA_ADMIN}/source/${org}/.da/translate.json`
      ? json({ config: { data: [{ key: 'from', value: 'org' }] } })
      : new Response('', { status: 404 })));
    const fetchConfig = await loadFetchConfig();
    const options = await fetchConfig(org, site);
    expect(calls.map(({ url }) => url)).to.deep.equal([
      `${DA_ADMIN}/source/${org}/${site}/.da/translate.json`,
      `${DA_ADMIN}/source/${org}/.da/translate.json`,
    ]);
    expect(options.config.data[0].value).to.equal('org');
  });
});
