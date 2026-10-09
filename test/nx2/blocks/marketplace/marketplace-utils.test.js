import { expect } from '@esm-bundle/chai';
import {
  MARKETPLACE_PATH,
  normalizeItem,
  fetchMarketplace,
} from '../../../../nx2/blocks/marketplace/marketplace-utils.js';

const origin = 'https://main--da-live--adobe.aem.page';

function installFetch(handler) {
  const origFetch = window.fetch;
  window.fetch = handler;
  return () => { window.fetch = origFetch; };
}

describe('normalizeItem', () => {
  it('maps a full row', () => {
    const row = {
      Title: 'MSM',
      Description: 'Manage msm',
      'Doc Url': 'https://github.com/adobe-rnd/aem-apps/tree/main/tools/apps/msm',
      'Try Url': 'https://da.live/app/x/msm',
      Owner: ' Adobe ',
      Type: 'App & Plugin',
      Image: 'https://example.com/t.png',
    };
    expect(normalizeItem({ row, origin })).to.deep.equal({
      title: 'MSM',
      description: 'Manage msm',
      docHref: 'https://github.com/adobe-rnd/aem-apps/tree/main/tools/apps/msm',
      tryHref: 'https://da.live/app/x/msm',
      owner: 'Adobe',
      types: ['App', 'Plugin'],
      imageHref: 'https://example.com/t.png',
    });
  });

  it('trims whitespace', () => {
    const row = { Title: '  MSM  ', 'Doc Url': ' https://da.live/a ' };
    const result = normalizeItem({ row, origin });
    expect(result.title).to.equal('MSM');
    expect(result.docHref).to.equal('https://da.live/a');
  });

  it('returns null without title', () => {
    expect(normalizeItem({ row: { Title: '', 'Doc Url': 'https://da.live/a' }, origin })).to.equal(null);
    expect(normalizeItem({ row: { Title: '   ', 'Doc Url': 'https://da.live/a' }, origin })).to.equal(null);
  });

  it('returns null without doc url and try url', () => {
    expect(normalizeItem({ row: { Title: 'MSM', 'Doc Url': '', 'Try Url': '' }, origin })).to.equal(null);
  });

  it('keeps a row with only a try url', () => {
    const row = { Title: 'MSM', 'Try Url': 'https://da.live/app/x/msm' };
    const result = normalizeItem({ row, origin });
    expect(result.docHref).to.equal(undefined);
    expect(result.tryHref).to.equal('https://da.live/app/x/msm');
  });

  it('drops an unsafe try url', () => {
    // eslint-disable-next-line no-script-url
    const row = { Title: 'MSM', 'Doc Url': 'https://da.live/a', 'Try Url': 'javascript:alert(1)' };
    expect(normalizeItem({ row, origin }).tryHref).to.equal(undefined);
  });

  it('returns null for non-http path', () => {
    // eslint-disable-next-line no-script-url
    const row = { Title: 'MSM', 'Doc Url': 'javascript:alert(1)' };
    expect(normalizeItem({ row, origin })).to.equal(null);
  });

  it('resolves relative path and image', () => {
    const row = { Title: 'MSM', 'Doc Url': '/tools/x.html', Image: '/media/t.png' };
    const result = normalizeItem({ row, origin });
    expect(result.docHref).to.equal(`${origin}/tools/x.html`);
    expect(result.imageHref).to.equal(`${origin}/media/t.png`);
  });

  it('drops unsafe or empty image', () => {
    const base = { Title: 'MSM', 'Doc Url': 'https://da.live/a' };
    expect(normalizeItem({ row: { ...base, Image: '' }, origin }).imageHref).to.equal(undefined);
    expect(normalizeItem({ row: { ...base, Image: 'data:image/png;base64,AA' }, origin }).imageHref)
      .to.equal(undefined);
    // eslint-disable-next-line no-script-url
    expect(normalizeItem({ row: { ...base, Image: 'javascript:x' }, origin }).imageHref).to.equal(undefined);
  });

  it('handles missing description, owner and type', () => {
    const row = { Title: 'MSM', 'Doc Url': 'https://da.live/a' };
    const result = normalizeItem({ row, origin });
    expect(result.description).to.equal('');
    expect(result.owner).to.equal('');
    expect(result.types).to.deep.equal([]);
  });

  it('splits single type', () => {
    const row = { Title: 'MSM', 'Doc Url': 'https://da.live/a', Type: 'Plugin' };
    expect(normalizeItem({ row, origin }).types).to.deep.equal(['Plugin']);
  });
});

describe('fetchMarketplace', () => {
  let restoreFetch;

  afterEach(() => {
    restoreFetch?.();
  });

  it('requests the marketplace path on the origin', async () => {
    let capturedArg;
    restoreFetch = installFetch(async (url) => {
      capturedArg = url;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });

    await fetchMarketplace({ origin });

    expect(String(capturedArg)).to.equal(`${origin}${MARKETPLACE_PATH}`);
  });

  it('returns normalized items, dropping invalid rows', async () => {
    const validRow = {
      Title: 'MSM',
      Description: 'Manage msm',
      'Doc Url': 'https://da.live/app/x/msm',
      Type: 'App',
      Image: 'https://example.com/t.png',
    };
    restoreFetch = installFetch(async () => new Response(
      JSON.stringify({ data: [validRow, { Title: '', 'Doc Url': 'x' }] }),
      { status: 200 },
    ));

    const result = await fetchMarketplace({ origin });

    expect(result.items.length).to.equal(1);
    expect(result.items[0].title).to.equal(validRow.Title);
  });

  it('returns empty items when data missing', async () => {
    restoreFetch = installFetch(async () => new Response(JSON.stringify({}), { status: 200 }));

    const result = await fetchMarketplace({ origin });

    expect(result).to.deep.equal({ items: [] });
  });

  it('normalizes items from a multi-sheet doc, using the first sheet', async () => {
    const validRow = { Title: 'MSM', Description: 'Manage msm', 'Doc Url': 'https://da.live/app/x/msm' };
    restoreFetch = installFetch(async () => new Response(JSON.stringify({
      ':type': 'multi-sheet',
      ':names': ['apps', 'other'],
      apps: { data: [validRow] },
      other: { data: [{ Title: 'Ignored', 'Doc Url': 'https://da.live/other' }] },
    }), { status: 200 }));

    const result = await fetchMarketplace({ origin });

    expect(result.items.length).to.equal(1);
    expect(result.items[0].title).to.equal('MSM');
  });

  it('returns error with status on non-OK', async () => {
    restoreFetch = installFetch(async () => new Response('', { status: 404 }));

    const result = await fetchMarketplace({ origin });

    expect(result).to.deep.equal({ error: 'Could not load marketplace.', status: 404 });
  });

  it('returns error when fetch throws', async () => {
    restoreFetch = installFetch(async () => { throw new Error('network down'); });

    const result = await fetchMarketplace({ origin });

    expect(result.error).to.equal('Could not load marketplace.');
    expect(result.items).to.equal(undefined);
  });

  it('returns error when body is not JSON', async () => {
    restoreFetch = installFetch(async () => new Response('<html>', { status: 200 }));

    const result = await fetchMarketplace({ origin });

    expect(result.error).to.equal('Could not load marketplace.');
  });
});
