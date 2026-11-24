import { expect } from '@esm-bundle/chai';
import { clearConfigCache, fetchConfig } from '../../../nx/blocks/loc/utils/utils.js';
import { validateConfig } from '../../../nx/blocks/loc/utils/validate-config.js';
import { getUrls } from '../../../nx/blocks/loc/views/translate/index.js';
import '../../../nx/blocks/loc/views/validate/validate.js';

const CONFIG = { config: { data: [{ key: 'from', value: 'site' }] } };

describe('loc config that cannot be read', () => {
  let origFetch;
  let reads;

  const failConfigReads = ({ times = Infinity } = {}) => {
    reads = [];
    window.fetch = async (url) => {
      const href = url.toString();
      reads.push(href);
      if (href.endsWith('/.da/translate.json') && reads.length <= times) {
        throw new TypeError('Failed to fetch');
      }
      return new Response(JSON.stringify(CONFIG), { status: 200 });
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

  it('reports the error and does not cache it', async () => {
    failConfigReads({ times: 1 });
    const failed = await fetchConfig('org', 'site');
    expect(failed).to.deep.equal({ loadError: 'Failed to fetch' });
    expect((await validateConfig(failed)).errors).to.deep.equal(['Failed to fetch']);
    const options = await fetchConfig('org', 'site');
    expect(options.config.data[0].value).to.equal('site');
  });

  it('marks every url instead of reading pages for translation', async () => {
    failConfigReads();
    const { urls } = await getUrls('org', 'site', { connector: null }, '/en', '/en', [{ suppliedPath: '/en/page' }], true);
    expect(urls[0].error).to.equal('Failed to fetch');
    expect(reads.some((href) => href.endsWith('.html'))).to.equal(false);
  });

  it('shows the error in validate and reads the config again next time', async () => {
    failConfigReads();
    const Validate = customElements.get('nx-loc-validate');
    const ctx = {
      _org: 'org',
      _site: 'site',
      _urls: [],
      findConfigValue: Validate.prototype.findConfigValue,
      getOriginMatches: Validate.prototype.getOriginMatches,
      checkUrl: async () => {},
      updateSourceMessage: async () => {},
    };
    await Validate.prototype.checkUrls.call(ctx);
    expect(ctx._message).to.deep.equal({ type: 'error', text: 'Failed to fetch' });
    expect(ctx._configSheet).to.be.undefined;
  });
});
