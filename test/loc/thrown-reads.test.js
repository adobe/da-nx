import { expect } from '@esm-bundle/chai';
import { rolloutLang } from '../../nx/blocks/loc/views/rollout/index.js';
import { getUrls } from '../../nx/blocks/loc/views/translate/index.js';
import { clearConfigCache, loadProject } from '../../nx/blocks/loc/utils/utils.js';
import '../../nx/blocks/loc/views/validate/validate.js';

const message = 'Failed to fetch';

describe('loc reads that throw', () => {
  let origFetch;
  let calls;

  const failPageReads = () => {
    calls = [];
    window.fetch = async (url, opts = {}) => {
      const href = url.toString();
      const method = opts.method || 'GET';
      calls.push({ href, method });
      if (href.endsWith('/.da/translate.json')) {
        return new Response(JSON.stringify({ config: { data: [] } }), { status: 200 });
      }
      if (method === 'GET') throw new TypeError(message);
      return new Response('', { status: 200 });
    };
  };

  beforeEach(() => {
    origFetch = window.fetch;
    clearConfigCache();
  });

  afterEach(() => {
    window.fetch = origFetch;
    clearConfigCache();
  });

  it('marks the page as failed in translate', async () => {
    failPageReads();
    const { urls } = await getUrls('org', 'site', {}, '/en', '/en', [{ suppliedPath: '/en/page' }], true);
    expect(urls[0].content).to.be.undefined;
    expect(urls[0].error).to.equal(`Error fetching content from /en/page.html - ${message}`);
  });

  it('stops a rollout before writing anything', async () => {
    failPageReads();
    const lang = { name: 'English', location: '/en', locales: [{ code: '/en/us' }], rollout: {} };
    const result = await rolloutLang({
      org: 'org',
      site: 'site',
      title: 'Proj',
      options: { 'source.language': { location: '/en' }, 'rollout.conflict.behavior': 'overwrite' },
      lang,
      urls: [{ suppliedPath: '/en/page' }],
      actions: { requestUpdate: () => {} },
    });
    expect(result.aborted).to.equal(true);
    expect(result.errors[0].error).to.include(message);
    expect(calls.filter(({ method }) => method !== 'GET')).to.deep.equal([]);
  });

  it('marks the page as failed in validate', async () => {
    failPageReads();
    const Validate = customElements.get('nx-loc-validate');
    const url = new URL('https://main--site--org.aem.page/en/page');
    const ctx = {
      _org: 'org',
      _site: 'site',
      _urls: [url],
      getOriginMatches: async () => [],
      checkUrl: Validate.prototype.checkUrl,
      findFragments: async () => {},
      requestUpdate: () => {},
      updateSourceMessage: async () => {},
    };
    await Validate.prototype.checkUrls.call(ctx);
    expect(url.status).to.equal(`error - ${message}`);
    expect(url.checked).to.equal(false);
  });

  it('reports an error when loading a project', async () => {
    failPageReads();
    const result = await loadProject({ path: '/org/site/.da/translation/active/1', updateDocTitle: false });
    expect(result).to.deep.equal({ message: { text: message } });
  });
});
