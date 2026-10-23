import { expect } from '@esm-bundle/chai';
import {
  MARKETPLACE_PATH,
  normalizeItem,
  fetchMarketplace,
  getCategories,
  filterByCategories,
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
      Category: ' Core ',
      Image: 'https://example.com/t.png',
    };
    expect(normalizeItem({ row, origin })).to.deep.equal({
      title: 'MSM',
      description: 'Manage msm',
      docHref: 'https://github.com/adobe-rnd/aem-apps/tree/main/tools/apps/msm',
      tryHref: 'https://da.live/app/x/msm',
      owner: 'Adobe',
      type: 'App & Plugin',
      category: 'Core',
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
    expect(result.type).to.equal('');
    expect(result.category).to.equal('');
  });

  it('keeps the type text as written, trimmed', () => {
    const row = { Title: 'MSM', 'Doc Url': 'https://da.live/a', Type: '  App & Plugin ' };
    expect(normalizeItem({ row, origin }).type).to.equal('App & Plugin');
  });
});

describe('getCategories', () => {
  const block = (className) => {
    const el = document.createElement('div');
    el.className = className;
    return el;
  };

  it('returns empty list without options', () => {
    expect(getCategories(block('marketplace'))).to.deep.equal([]);
  });

  it('returns option classes after the block name', () => {
    expect(getCategories(block('marketplace core extension'))).to.deep.equal(['core', 'extension']);
  });

  it('ignores a prefixed block name', () => {
    expect(getCategories(block('nx-marketplace core'))).to.deep.equal(['core']);
  });
});

describe('filterByCategories', () => {
  const items = [
    { title: 'A', category: 'Core' },
    { title: 'B', category: 'Extension' },
    { title: 'C', category: '' },
  ];
  const titles = (list) => list.map(({ title }) => title);

  it('returns all items without categories', () => {
    expect(titles(filterByCategories({ items, categories: [] }))).to.deep.equal(['A', 'B', 'C']);
    expect(titles(filterByCategories({ items }))).to.deep.equal(['A', 'B', 'C']);
  });

  it('filters by a single category, case-insensitive', () => {
    expect(titles(filterByCategories({ items, categories: ['core'] }))).to.deep.equal(['A']);
  });

  it('filters by multiple categories', () => {
    expect(titles(filterByCategories({ items, categories: ['core', 'extension'] })))
      .to.deep.equal(['A', 'B']);
  });

  it('returns empty list when nothing matches', () => {
    expect(filterByCategories({ items, categories: ['other'] })).to.deep.equal([]);
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
