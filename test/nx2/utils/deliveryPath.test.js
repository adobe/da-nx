import { expect } from '@esm-bundle/chai';
import { applyUrlTemplate, getConfiguredDeliveryUrl } from '../../../nx2/utils/deliveryPath.js';

describe('applyUrlTemplate', () => {
  it('substitutes the aemPath token into the template', () => {
    const url = applyUrlTemplate(
      // eslint-disable-next-line no-template-curly-in-string
      'https://da-sc.adobeaem.workers.dev/preview${aemPath}',
      '/kozmaadrian/da-sc/forms/ai-evolution',
    );
    expect(url).to.equal('https://da-sc.adobeaem.workers.dev/preview/kozmaadrian/da-sc/forms/ai-evolution');
  });

  it('collapses a duplicate slash from a trailing-slash template', () => {
    const url = applyUrlTemplate(
      // eslint-disable-next-line no-template-curly-in-string
      'https://example.com/preview/${aemPath}',
      '/org/site/page',
    );
    expect(url).to.equal('https://example.com/preview/org/site/page');
  });

  it('preserves the :// scheme separator', () => {
    const url = applyUrlTemplate(
      // eslint-disable-next-line no-template-curly-in-string
      'https://example.com${aemPath}',
      '/org/site/page',
    );
    expect(url).to.equal('https://example.com/org/site/page');
  });

  it('preserves a query string in the template', () => {
    const url = applyUrlTemplate(
      // eslint-disable-next-line no-template-curly-in-string
      'https://example.com/preview${aemPath}?mode=edit&x=1',
      '/org/site/page',
    );
    expect(url).to.equal('https://example.com/preview/org/site/page?mode=edit&x=1');
  });

  it('returns the template unchanged when there is no token', () => {
    const url = applyUrlTemplate('https://example.com/static', '/org/site/page');
    expect(url).to.equal('https://example.com/static');
  });
});

describe('getConfiguredDeliveryUrl', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  // fetchDaConfigs is memoized by org/site, so every test uses a unique org.
  const mockRows = (site, rowsBySite) => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => (url.includes(`/${site}/`) ? { data: rowsBySite } : { data: [] }),
    });
  };

  it('returns null when no matching config row exists', async () => {
    mockRows('site-a', []);
    const url = await getConfiguredDeliveryUrl({
      org: 'dp-org-a', site: 'site-a', action: 'preview', aemPath: '/dp-org-a/site-a/forms/x',
    });
    expect(url).to.equal(null);
  });

  it('resolves a preview.path override for a matching prefix', async () => {
    mockRows('site-b', [
      // eslint-disable-next-line no-template-curly-in-string
      { key: 'preview.path', value: '/dp-org-b/site-b/forms=https://da-sc.adobeaem.workers.dev/preview${aemPath}' },
    ]);
    const url = await getConfiguredDeliveryUrl({
      org: 'dp-org-b', site: 'site-b', action: 'preview', aemPath: '/dp-org-b/site-b/forms/ai-evolution',
    });
    expect(url).to.equal('https://da-sc.adobeaem.workers.dev/preview/dp-org-b/site-b/forms/ai-evolution');
  });

  it('does not match a prefix outside the configured path', async () => {
    mockRows('site-c', [
      // eslint-disable-next-line no-template-curly-in-string
      { key: 'preview.path', value: '/dp-org-c/site-c/forms=https://example.com/preview${aemPath}' },
    ]);
    const url = await getConfiguredDeliveryUrl({
      org: 'dp-org-c', site: 'site-c', action: 'preview', aemPath: '/dp-org-c/site-c/guidelines/intro',
    });
    expect(url).to.equal(null);
  });

  it('uses live.path for the publish action, not preview.path', async () => {
    mockRows('site-d', [
      // eslint-disable-next-line no-template-curly-in-string
      { key: 'preview.path', value: '/dp-org-d/site-d/forms=https://example.com/preview${aemPath}' },
      // eslint-disable-next-line no-template-curly-in-string
      { key: 'live.path', value: '/dp-org-d/site-d/forms=https://example.com/live${aemPath}' },
    ]);
    const url = await getConfiguredDeliveryUrl({
      org: 'dp-org-d', site: 'site-d', action: 'publish', aemPath: '/dp-org-d/site-d/forms/x',
    });
    expect(url).to.equal('https://example.com/live/dp-org-d/site-d/forms/x');
  });

  it('picks the longest matching prefix', async () => {
    mockRows('site-e', [
      // eslint-disable-next-line no-template-curly-in-string
      { key: 'preview.path', value: '/dp-org-e/site-e=https://example.com/site${aemPath}' },
      // eslint-disable-next-line no-template-curly-in-string
      { key: 'preview.path', value: '/dp-org-e/site-e/forms=https://example.com/forms${aemPath}' },
    ]);
    const url = await getConfiguredDeliveryUrl({
      org: 'dp-org-e', site: 'site-e', action: 'preview', aemPath: '/dp-org-e/site-e/forms/x',
    });
    expect(url).to.equal('https://example.com/forms/dp-org-e/site-e/forms/x');
  });

  it('keeps a query string that lives after the URL in the value', async () => {
    mockRows('site-f', [
      // eslint-disable-next-line no-template-curly-in-string
      { key: 'preview.path', value: '/dp-org-f/site-f/forms=https://example.com/preview${aemPath}?mode=edit' },
    ]);
    const url = await getConfiguredDeliveryUrl({
      org: 'dp-org-f', site: 'site-f', action: 'preview', aemPath: '/dp-org-f/site-f/forms/x',
    });
    expect(url).to.equal('https://example.com/preview/dp-org-f/site-f/forms/x?mode=edit');
  });

  it('ignores a malformed row that has no "=" separator', async () => {
    mockRows('site-i', [
      { key: 'preview.path', value: '/dp-org-i/site-i/forms' },
    ]);
    const url = await getConfiguredDeliveryUrl({
      org: 'dp-org-i', site: 'site-i', action: 'preview', aemPath: '/dp-org-i/site-i/forms/x',
    });
    expect(url).to.equal(null);
  });

  it('returns null (does not throw) when the config fetch rejects', async () => {
    window.fetch = async () => { throw new Error('network down'); };
    const url = await getConfiguredDeliveryUrl({
      org: 'dp-org-j', site: 'site-j', action: 'preview', aemPath: '/dp-org-j/site-j/forms/x',
    });
    expect(url).to.equal(null);
  });

  it('reads the tab named "data" in a multi-sheet config, not the first tab', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => (url.includes('/site-g/')
        ? {
          ':type': 'multi-sheet',
          ':names': ['settings', 'data'],
          // first tab — must be ignored
          settings: {
            // eslint-disable-next-line no-template-curly-in-string
            data: [{ key: 'preview.path', value: '/dp-org-g/site-g/forms=https://wrong.example.com${aemPath}' }],
          },
          data: {
            // eslint-disable-next-line no-template-curly-in-string
            data: [{ key: 'preview.path', value: '/dp-org-g/site-g/forms=https://right.example.com${aemPath}' }],
          },
        }
        : { data: [] }),
    });
    const url = await getConfiguredDeliveryUrl({
      org: 'dp-org-g', site: 'site-g', action: 'preview', aemPath: '/dp-org-g/site-g/forms/x',
    });
    expect(url).to.equal('https://right.example.com/dp-org-g/site-g/forms/x');
  });

  it('lets a site-level row win an equal-length prefix tie over org', async () => {
    window.fetch = async (url) => ({
      ok: true,
      json: async () => ({
        data: url.includes('/site-h/')
          // eslint-disable-next-line no-template-curly-in-string
          ? [{ key: 'preview.path', value: '/dp-org-h/site-h/forms=https://example.com/SITE${aemPath}' }]
          // eslint-disable-next-line no-template-curly-in-string
          : [{ key: 'preview.path', value: '/dp-org-h/site-h/forms=https://example.com/ORG${aemPath}' }],
      }),
    });
    const url = await getConfiguredDeliveryUrl({
      org: 'dp-org-h', site: 'site-h', action: 'preview', aemPath: '/dp-org-h/site-h/forms/x',
    });
    expect(url).to.equal('https://example.com/SITE/dp-org-h/site-h/forms/x');
  });
});
