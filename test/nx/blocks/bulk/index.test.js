import { expect } from '@esm-bundle/chai';
import { formatUrls, sendAction } from '../../../../nx/blocks/bulk/index.js';
import { DA_ORIGIN } from '../../../../nx2/public/utils/constants.js';
import { AEM_API, HLX_ADMIN } from '../../../../nx2/utils/utils.js';
import { calls, installFetch, lastCall, restoreFetch } from '../../../nx2/mocks/fetch.js';

describe('bulk operations', () => {
  afterEach(() => restoreFetch());

  it('previews a Helix 6 page through the site API', async () => {
    installFetch({ pingHlx6: true });
    const [url] = formatUrls('https://main--preview-site--org.aem.page/about', 'preview');
    const result = await sendAction(url);
    expect(lastCall().url).to.equal(`${AEM_API}/org/sites/preview-site/preview/about`);
    expect(lastCall().method).to.equal('POST');
    expect(result.ok).to.equal(true);
    expect(result.status).to.equal(200);
  });

  it('publishes a Helix 6 page through the site API and reports its status', async () => {
    installFetch({ pingHlx6: true, status: 404 });
    const [url] = formatUrls('https://branch--publish-site--org.aem.page/about', 'live');
    const result = await sendAction(url);
    expect(lastCall().url).to.equal(`${AEM_API}/org/sites/publish-site/live/about`);
    expect(lastCall().method).to.equal('POST');
    expect(result.ok).to.equal(false);
    expect(result.status).to.equal(404);
  });

  it('unpublishes a Helix 6 page with DELETE', async () => {
    installFetch({ pingHlx6: true });
    const [url] = formatUrls('https://main--unpublish-site--org.aem.live/about', 'live', true);
    await sendAction(url);
    expect(lastCall().url).to.equal(`${AEM_API}/org/sites/unpublish-site/live/about`);
    expect(lastCall().method).to.equal('DELETE');
  });

  it('keeps the URL ref when previewing a legacy page', async () => {
    installFetch();
    const [url] = formatUrls('https://branch--legacy-site--org.aem.page/about', 'preview');
    await sendAction(url);
    expect(lastCall().url).to.equal(`${HLX_ADMIN}/preview/org/legacy-site/branch/about`);
    expect(lastCall().method).to.equal('POST');
  });

  it('keeps the legacy route when the upgrade probe fails', async () => {
    installFetch();
    const mockFetch = window.fetch;
    window.fetch = async (url, opts) => {
      if (url.startsWith(`${HLX_ADMIN}/ping/`)) throw new TypeError('Failed to fetch');
      return mockFetch(url, opts);
    };
    const [url] = formatUrls('https://branch--probe-fails--org.aem.page/about', 'live');
    await sendAction(url);
    expect(lastCall().url).to.equal(`${HLX_ADMIN}/live/org/probe-fails/branch/about`);
    expect(lastCall().method).to.equal('POST');
  });

  it('marks a URL as failed when the request throws', async () => {
    installFetch();
    window.fetch = async () => { throw new TypeError('Failed to fetch'); };
    const [url] = formatUrls('https://main--request-fails--org.aem.page/about', 'index');
    const result = await sendAction(url);
    expect(result.ok).to.equal(false);
    expect(result.status).to.equal(0);
  });

  it('versions a page through DA with its label', async () => {
    installFetch();
    const [url] = formatUrls('https://main--site--org.aem.page/about', 'versionsource');
    await sendAction(url, 'Before edit');
    expect(lastCall().url).to.equal(`${DA_ORIGIN}/versionsource/org/site/about.html`);
    expect(lastCall().method).to.equal('POST');
    expect(JSON.parse(lastCall().body)).to.deep.equal({ label: 'Before edit' });
    expect(calls).to.have.lengthOf(1);
  });

  it('keeps Index on the legacy Admin API', async () => {
    installFetch();
    const [url] = formatUrls('https://branch--site--org.aem.page/about', 'index');
    await sendAction(url);
    expect(lastCall().url).to.equal(`${HLX_ADMIN}/index/org/site/branch/about`);
    expect(lastCall().method).to.equal('POST');
    expect(calls).to.have.lengthOf(1);
  });
});
