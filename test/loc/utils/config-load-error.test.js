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
    const connector = { dnt: { addDnt: (content) => content } };
    const { urls } = await getUrls('org', 'site', { connector }, '/en', '/en', [{ suppliedPath: '/en/page' }], true);
    expect(urls[0].error).to.equal('Failed to fetch');
    expect(reads.some((href) => href.endsWith('.html'))).to.equal(false);
  });

  it('loads pages for copy without reading the translate config', async () => {
    failConfigReads();
    const { urls } = await getUrls('org', 'site', {}, '/en', '/en', [{ suppliedPath: '/en/page' }], true);
    expect(urls[0].error).to.be.undefined;
    expect(reads.some((href) => href.endsWith('/.da/translate.json'))).to.equal(false);
    expect(reads.some((href) => href.endsWith('.html'))).to.equal(true);
  });

  it('shows the error in validate without selecting an unchecked page', async () => {
    failConfigReads();
    const el = document.createElement('nx-loc-validate');
    const url = { pathname: '/en/page', checked: false };
    el._org = 'org';
    el._site = 'site';
    el._urls = [url];
    await el.checkUrls();
    el.handleChanged(url);
    expect(el._message).to.deep.equal({ type: 'error', text: 'Failed to fetch' });
    expect(el._configSheet).to.be.undefined;
    expect(url.checked).to.equal(false);
    expect(reads).to.have.length(1);
  });
});
